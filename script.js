import { System_prompt, FRAME_TEMPLATE } from "./utils.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { bootstrapAlert } from "https://cdn.jsdelivr.net/npm/bootstrap-alert@1";

const $ = id => document.getElementById(id);
const S = {
  provider: null,
  models: [],
  currentModel: null,
  sourceCode: "",
  frame: null,
  frameReady: false,
  pendingCode: null,
  session: []
};

const SYSTEM_PROMPT = System_prompt;
const stripFences = s => s.replace(/^```(?:js|javascript)?\s*/i, "").replace(/```$/i, "");
const alertBox = (type, message) => {
  bootstrapAlert({
    body: message,
    color: type,
    position: 'top-0 end-0',
    delay: type === 'success' ? 3000 : 5000
  });
};

const showLoading = show => $('loading').classList.toggle('d-none', !show);
async function initLlm(show = false) {
  try {
    const config = await openaiConfig({
      title: "LLM Configuration for 3D Generator",
      defaultBaseUrls: [
        "https://api.openai.com/v1",
        "https://openrouter.ai/api/v1",
        "https://api.anthropic.com/v1"
      ],
      help: '<div class="alert alert-info">Configure your LLM provider to generate 3D scenes. OpenRouter recommended for model variety.</div>',
      show
    });
    
    S.provider = { baseUrl: config.baseUrl, apiKey: config.apiKey, models: config.models };
    S.models = config.models.map(model => ({ id: model, name: model }));
    S.currentModel = S.models.find(m => m.id.split("/").pop() === "gpt-4.1-mini")?.id || S.models[0]?.id;
    fillModelDropdown();
    alertBox('success', 'LLM configured successfully');
  } catch (error) {
    alertBox('danger', `Failed to initialize LLM: ${error.message}`);
  }
}

function fillModelDropdown() {
  const select = $('model-select');
  select.replaceChildren(...S.models.map(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    option.selected = model.id === S.currentModel;
    return option;
  }));
}

async function llmGenerate({ promptText, priorCode, screenshotDataUrl }) {
  if (!S.provider) throw new Error('LLM not configured. Please click Config button.');
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (priorCode && screenshotDataUrl) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Task: Modify the existing Three.js scene per: "${promptText}"\n\nCurrent code:\n${priorCode}\n\nA screenshot of the current render is attached. Please modify the code to implement the requested changes while preserving the overall structure.`
        },
        { type: "image_url", image_url: { url: screenshotDataUrl } }
      ]
    });
  } else {
    messages.push({
      role: "user",
      content: `Task: Create a 3D scene per: "${promptText}"\nConstraints:\n- No imports; the runtime provides THREE, OrbitControls as parameters.\n- Add ground plane, reasonable lights, and camera framing of subject.\n- Use new OrbitControls(camera, renderer.domElement) if needed.\n- Return ONLY code for export default function renderScene({ THREE, scene, camera, renderer, controls, OrbitControls }) { ... }.`
    });
  }
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${S.provider.apiKey}`
    },
    body: JSON.stringify({ model: S.currentModel, messages, stream: true })
  };
  let fullContent = "";
  const codeView = $('code-view');
  try {
    for await (const data of asyncLLM(S.provider.baseUrl + "/chat/completions", requestOptions)) {
      if (data.content) {
        fullContent = data.content;
        codeView.textContent = stripFences(fullContent);
      }
    }
  } catch (error) {
    console.error('Streaming error:', error);
    throw error;
  }
  return stripFences(fullContent).trim();
}

const runInFrame = code => {
  if (!S.frameReady) { S.pendingCode = code; return; }
  S.frame.contentWindow.postMessage({ type: 'RUN_CODE', code }, '*');
};

const getScreenshot = () => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    window.removeEventListener('message', handler);
    reject(new Error('Screenshot timeout'));
  }, 10000);
  const handler = e => {
    if (e.data.type === 'SCREENSHOT') {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(e.data.dataUrl);
    }
  };
  window.addEventListener('message', handler);
  S.frame.contentWindow.postMessage({ type: 'GET_SCREENSHOT' }, '*');
});

async function submit() {
  const promptText = $('user-prompt').value.trim();
  if (!promptText) { alertBox('warning', 'Please enter a prompt'); return; }
  if (!S.provider) { alertBox('danger', 'Please configure LLM first'); return; }
  S.currentModel = $('model-select').value;
  showLoading(true);
  try {
    let screenshotDataUrl = null;
    if (S.sourceCode) {
      try {
        screenshotDataUrl = await getScreenshot();
      } catch (error) {
        console.warn('Failed to capture screenshot:', error);
      }
    }
    const code = await llmGenerate({ promptText, priorCode: S.sourceCode, screenshotDataUrl });
    if (code) {
      S.sourceCode = code;
      runInFrame(code);
      S.session.push({ prompt: promptText, code, screenshot: screenshotDataUrl, timestamp: Date.now() });
      alertBox('success', 'Scene generated successfully');
    } else {
      alertBox('warning', 'No code generated. Please try again.');
    }
  } catch (error) {
    console.error('Generation error:', error);
    alertBox('danger', `Error: ${error.message}`);
  }
  showLoading(false);
}

const copyCode = () => {
  navigator.clipboard.writeText(S.sourceCode)
    .then(() => alertBox('success', 'Code copied')).catch(() => alertBox('danger', 'Failed'));
};

const saveSession = () => {
  const sessionData = { session: S.session, currentCode: S.sourceCode, timestamp: Date.now() };
  const dataUrl = `data:application/json,${encodeURIComponent(JSON.stringify(sessionData, null, 2))}`;
  Object.assign(document.createElement("a"), { href: dataUrl, download: "3d-prompt-session.json" }).click();
  alertBox('success', 'Session saved');
};

const loadSession = file => {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      S.session = data.session || [];
      S.sourceCode = data.currentCode || "";
      $('code-view').textContent = S.sourceCode;
      if (S.sourceCode) runInFrame(S.sourceCode);
      alertBox('success', 'Session loaded successfully');
    } catch (error) {
      alertBox('danger', 'Failed to load session file');
    }
  };
  reader.readAsText(file);
};

// Event Listeners
const addEventListeners = () => {
  $('config-btn').addEventListener('click', () => initLlm(true));
  $('btn-generate').addEventListener('click', submit);
  $('btn-copy').addEventListener('click', copyCode);
  $('save-conversation').addEventListener('click', saveSession);
  $('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadSession(file);
  });
  $('user-prompt').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {  e.preventDefault();  submit(); }
  });
};

const handleFrameMessages = e => {
  const { type } = e.data;
  if (type === 'READY') {
    S.frameReady = true;
    if (S.pendingCode) { runInFrame(S.pendingCode); S.pendingCode = null; }
  } else if (type === 'ERROR') {
    alertBox('danger', `Execution error: ${e.data.message}`);
  }
};
// Initialize
const init = () => {
  S.frame = $('render-frame');
  S.frame.srcdoc = FRAME_TEMPLATE;
  addEventListeners();
  window.addEventListener('message', handleFrameMessages);
  initLlm().catch(() => console.log('LLM not configured yet, user will need to click config'));
};
init();