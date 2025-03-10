'use client';

import React, { useState, useEffect } from 'react';
import { AgentConfig } from '../types/agent';

export default function Home() {
  const [activeTab, setActiveTab] = useState(1);
  const [agentOutput, setAgentOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [browserView, setBrowserView] = useState("<h1 style='width:80vw; height:50vh'>Waiting for browser session...</h1>");
  
  // Research state
  const [isResearchRunning, setIsResearchRunning] = useState(false);
  const [researchOutput, setResearchOutput] = useState("");
  const [researchFilePath, setResearchFilePath] = useState("");
  const [researchTask, setResearchTask] = useState("Compose a report on the use of Reinforcement Learning for training Large Language Models, encompassing its origins, current advancements, and future prospects, substantiated with specific examples and citing key research papers.");
  const [maxSearchIteration, setMaxSearchIteration] = useState(3);
  const [maxQueryPerIter, setMaxQueryPerIter] = useState(3);
  
  // Results state
  const [finalResult, setFinalResult] = useState("");
  const [modelActions, setModelActions] = useState("");
  const [modelThoughts, setModelThoughts] = useState("");
  const [errors, setErrors] = useState("");
  const [traceFilePath, setTraceFilePath] = useState("");
  const [agentHistoryFilePath, setAgentHistoryFilePath] = useState("");
  
  // Recordings state
  const [recordings, setRecordings] = useState<string[]>([]);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  
  // Configuration state
  const [configName, setConfigName] = useState("default");
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  
  // Agent configuration state with optimized defaults
  const [config, setConfig] = useState({
    agent_type: 'custom', // Use custom agent type for better performance
    max_steps: 15,
    max_actions_per_step: 5,
    use_vision: true,
    tool_calling_method: 'auto',
    
    // LLM Configuration - Default to OpenAI GPT-4 for best performance
    llm_provider: 'openai',
    llm_model_name: 'gpt-4o', // Using gpt-4o for better tool calling support
    llm_num_ctx: 16000,
    llm_temperature: 0.2,
    llm_base_url: '',
    llm_api_key: '',
    
    // Browser Settings
    use_own_browser: false,
    keep_browser_open: true, // Keep browser open for better performance
    headless: false,
    disable_security: true, // Disable security for better automation
    enable_recording: true,
    window_w: 1280,
    window_h: 720,
    save_recording_path: './tmp/record_videos',
    save_trace_path: './tmp/traces',
    save_agent_history_path: './tmp/agent_history',
    
    // Task
    task: 'go to google.com and search for "browser-use agent"',
    add_infos: ''
  });

  // State for model options
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  // Update model options when provider changes
  useEffect(() => {
    // Define model options for each provider
    const providerModels: Record<string, string[]> = {
      openai: ["gpt-4o", "gpt-4", "gpt-3.5-turbo", "gpt-4-turbo", "gpt-4-vision", "o3-mini"],
      anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307", "claude-3-sonnet-20240229"],
      groq: ["llama2-70b-4096", "mixtral-8x7b-32768", "gemma-7b-it"],
      ollama: ["qwen2.5:7b", "qwen2.5:14b", "qwen2.5:32b", "qwen2.5-coder:14b", "qwen2.5-coder:32b", "llama2:7b", "deepseek-r1:14b", "deepseek-r1:32b"],
      google: ["gemini-2.0-flash", "gemini-2.0-flash-thinking-exp", "gemini-1.5-flash-latest", "gemini-1.5-flash-8b-latest", "gemini-2.0-flash-thinking-exp-01-21", "gemini-2.0-pro-exp-02-05"],
      azure_openai: ["gpt-4o", "gpt-4", "gpt-3.5-turbo"],
      deepseek: ["deepseek-chat", "deepseek-reasoner"],
      alibaba: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"],
      moonshot: ["moonshot-v1-32k-vision-preview", "moonshot-v1-8k-vision-preview"],
      mistral: ["pixtral-large-latest", "mistral-large-latest", "mistral-small-latest", "ministral-8b-latest"]
    };
    
    // Update model options based on selected provider
    if (config.llm_provider in providerModels) {
      setModelOptions(providerModels[config.llm_provider]);
      
      // If the current model is not in the list for this provider, set to the first one
      if (!providerModels[config.llm_provider].includes(config.llm_model_name)) {
        setConfig({
          ...config,
          llm_model_name: providerModels[config.llm_provider][0]
        });
      }
    } else {
      setModelOptions([]);
    }
  }, [config.llm_provider]);

  // Add listener for Python messages
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron) {
      // Listen for Python messages
      const unsubscribePythonMessage = window.electron.onPythonMessage((message: any) => {
        console.log('Received message from Python:', message);
        
        if (message && typeof message === 'object') {
          // Add to agent output if it's a structured message
          if (message.status === 'ready') {
            setAgentOutput(prev => [...prev, `Python API initialized: ${message.message}`]);
          } else if (message.result && message.result.final_result) {
            setFinalResult(message.result.final_result);
            setModelActions(message.result.model_actions || '');
            setModelThoughts(message.result.model_thoughts || '');
            setErrors(message.result.errors || '');
            
            if (message.result.trace_file) {
              setTraceFilePath(message.result.trace_file);
            }
            
            if (message.result.history_file) {
              setAgentHistoryFilePath(message.result.history_file);
            }
          }
        } else if (typeof message === 'string') {
          // Add to agent output if it's a string
          setAgentOutput(prev => [...prev, message]);
        }
      });
      
      // Listen for Python errors
      const unsubscribePythonError = window.electron.onPythonError((error: any) => {
        console.error('Python error:', error);
        setErrors(prev => prev + '\n' + error);
        setAgentOutput(prev => [...prev, `Error: ${error}`]);
      });
      
      return () => {
        // Clean up listeners
        unsubscribePythonMessage();
        unsubscribePythonError();
      };
    }
  }, []);

  // Create directories on component mount
  useEffect(() => {
    const createDirectories = async () => {
      try {
        if (typeof window !== 'undefined' && window.electron) {
          // Ensure temp directories exist
          await window.electron.runAgent({
            id: 'init-dirs',
            action: 'create-dirs',
            paths: [
              './tmp/record_videos',
              './tmp/traces',
              './tmp/agent_history'
            ]
          });
        }
      } catch (error) {
        console.error('Error creating directories:', error);
      }
    };
    
    createDirectories();
  }, []);

  const handleRunAgent = async () => {
    setFinalResult("");
    setModelActions("");
    setModelThoughts("");
    setErrors("");
    setTraceFilePath("");
    setAgentHistoryFilePath("");
    setIsRunning(true);
    
    try {
      if (typeof window !== 'undefined' && window.electron) {
        // Call the API to run the agent
        const result = await window.electron.runAgent({
          id: Date.now().toString(),
          agent_type: config.agent_type,
          llm_provider: config.llm_provider,
          llm_model_name: config.llm_model_name,
          llm_temperature: config.llm_temperature,
          llm_num_ctx: config.llm_num_ctx,
          llm_base_url: config.llm_base_url,
          llm_api_key: config.llm_api_key,
          use_own_browser: config.use_own_browser,
          keep_browser_open: config.keep_browser_open,
          headless: config.headless,
          disable_security: config.disable_security,
          window_w: config.window_w,
          window_h: config.window_h,
          save_recording_path: config.enable_recording ? config.save_recording_path : null,
          save_agent_history_path: config.save_agent_history_path,
          save_trace_path: config.save_trace_path,
          enable_recording: config.enable_recording,
          task: config.task,
          add_infos: config.add_infos,
          max_steps: config.max_steps,
          use_vision: config.use_vision,
          max_actions_per_step: config.max_actions_per_step,
          tool_calling_method: config.tool_calling_method,
          chrome_cdp: null // Adding the chrome_cdp parameter, set to null
        });

        // Process the result based on its structure
        if (result) {
          if (result.status === 'error') {
            setErrors(result.message || "Unknown error occurred");
            setAgentOutput(prev => [...prev, `Error: ${result.message}`]);
          } else {
            // Handle successful result
            if (result.final_result) setFinalResult(result.final_result);
            if (result.model_actions) setModelActions(result.model_actions);
            if (result.model_thoughts) setModelThoughts(result.model_thoughts);
            if (result.errors) setErrors(result.errors);
            if (result.trace_file) setTraceFilePath(result.trace_file);
            if (result.history_file) setAgentHistoryFilePath(result.history_file);
            
            // Log the result summary
            setAgentOutput(prev => [...prev, "Agent execution completed successfully"]);
          }
        } else {
          setErrors("No response received from server");
          setAgentOutput(prev => [...prev, "No response received from server"]);
        }
      } else {
        setAgentOutput(prev => [...prev, "Electron bridge not available"]);
      }
    } catch (error) {
      console.error('Error running agent:', error);
      setErrors(error instanceof Error ? error.message : String(error));
      setAgentOutput(prev => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopAgent = async () => {
    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.stopAgent();
        setAgentOutput(prev => [...prev, "Agent stop requested"]);
      } else {
        setAgentOutput(prev => [...prev, "Electron bridge not available"]);
      }
    } catch (error) {
      console.error('Error stopping agent:', error);
      setAgentOutput(prev => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
    }
  };

  const handleRunDeepSearch = async () => {
    setResearchOutput("");
    setResearchFilePath("");
    setIsResearchRunning(true);

    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.runDeepSearch({
          id: Date.now().toString(),
          research_task: researchTask,
          max_search_iteration: maxSearchIteration,
          max_query_per_iter: maxQueryPerIter,
          llm_provider: config.llm_provider,
          llm_model_name: config.llm_model_name,
          llm_temperature: config.llm_temperature,
          llm_num_ctx: config.llm_num_ctx,
          llm_base_url: config.llm_base_url,
          llm_api_key: config.llm_api_key,
          use_vision: config.use_vision,
          use_own_browser: config.use_own_browser,
          headless: config.headless,
          chrome_cdp: null // Adding the chrome_cdp parameter, set to null
        });

        if (result && result.status === 'success') {
          setResearchOutput(result.markdown_content || "");
          setResearchFilePath(result.file_path || "");
        } else {
          setResearchOutput(`Error: ${result?.message || 'Unknown error'}`);
        }
      }
    } catch (error: unknown) {
      console.error('Error running deep search:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResearchOutput(`Error: ${errorMessage}`);
    } finally {
      setIsResearchRunning(false);
    }
  };

  const handleStopResearch = async () => {
    try {
      if (typeof window !== 'undefined' && window.electron) {
        await window.electron.stopResearchAgent();
      }
    } catch (error) {
      console.error('Error stopping research:', error);
    }
  };

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    
    // For checkbox inputs, use the checked property
    if (type === 'checkbox') {
      setConfig({ ...config, [name]: checked });
    } 
    // For number inputs, convert to number
    else if (type === 'number') {
      setConfig({ ...config, [name]: parseFloat(value) });
    } 
    // For everything else, use the value as is
    else {
      setConfig({ ...config, [name]: value });
    }
  };

  // Configuration functions
  const saveCurrentConfig = async () => {
    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.saveConfig({
          name: configName,
          config: config
        });
        if (result && result.status === 'success') {
          loadSavedConfigs();
        }
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
    }
  };

  const loadSavedConfigs = async () => {
    setIsLoadingConfigs(true);
    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.getConfigs();
        if (result && result.status === 'success') {
          setSavedConfigs(result.configs || []);
        }
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    } finally {
      setIsLoadingConfigs(false);
    }
  };

  const loadConfig = async (configName: string) => {
    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.loadConfig(configName);
        if (result && result.status === 'success' && result.config) {
          setConfig(result.config);
        }
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  };

  // Load configurations when the Configuration tab is selected
  useEffect(() => {
    if (activeTab === 7) {
      loadSavedConfigs();
    }
  }, [activeTab]);

  const loadRecordings = async () => {
    setIsLoadingRecordings(true);
    try {
      if (typeof window !== 'undefined' && window.electron) {
        const result = await window.electron.getRecordings(config.save_recording_path);
        if (result && result.status === 'success') {
          setRecordings(result.recordings || []);
        } else {
          console.error('Error loading recordings:', result?.message);
        }
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
    } finally {
      setIsLoadingRecordings(false);
    }
  };

  // Load recordings when the Recordings tab is selected
  useEffect(() => {
    if (activeTab === 6) {
      loadRecordings();
    }
  }, [activeTab]);

  // Load results when the Results tab is selected
  useEffect(() => {
    if (activeTab === 8) {
      // Load latest results if we have a function for that
      // For now, we'll just use the state that's updated via messages
    }
  }, [activeTab]);

  // Update error display function
  const displayErrors = (errors: string) => {
    if (!errors) return null;
    
    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-md">
        <h3 className="text-red-800 font-medium">Errors</h3>
        <pre className="mt-2 text-red-600 whitespace-pre-wrap text-sm overflow-auto max-h-40">
          {errors}
        </pre>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-center">Browser Use Agent</h1>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b flex-wrap">
          <button 
            className={`px-4 py-2 ${activeTab === 1 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(1)}
          >
            ⚙️ Agent Settings
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 2 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(2)}
          >
            🔧 LLM Configuration
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 3 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(3)}
          >
            🌐 Browser Settings
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 4 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(4)}
          >
            🤖 Run Agent
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 5 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(5)}
          >
            🔍 Deep Research
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 6 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(6)}
          >
            📁 Recordings
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 7 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(7)}
          >
            ⚙️ Configuration
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 8 ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => setActiveTab(8)}
          >
            📊 Results
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Agent Settings Tab */}
          {activeTab === 1 && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Type</label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="agent_type"
                      value="org"
                      checked={config.agent_type === 'org'}
                      onChange={handleChange}
                      className="form-radio h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">org</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="agent_type"
                      value="custom"
                      checked={config.agent_type === 'custom'}
                      onChange={handleChange}
                      className="form-radio h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">custom</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Run Steps</label>
                  <input
                    type="range"
                    name="max_steps"
                    min="1"
                    max="200"
                    value={config.max_steps}
                    onChange={handleChange}
                    className="w-full"
                  />
                  <div className="text-right">{config.max_steps}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Actions per Step</label>
                  <input
                    type="range"
                    name="max_actions_per_step"
                    min="1"
                    max="20"
                    value={config.max_actions_per_step}
                    onChange={handleChange}
                    className="w-full"
                  />
                  <div className="text-right">{config.max_actions_per_step}</div>
                </div>
              </div>

              <div className="mt-4">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    name="use_vision"
                    checked={config.use_vision}
                    onChange={handleChange}
                    className="form-checkbox h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2">Use Vision</span>
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tool Calling Method</label>
                <select
                  name="tool_calling_method"
                  value={config.tool_calling_method}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="auto">auto</option>
                  <option value="json_schema">json_schema</option>
                  <option value="function_calling">function_calling</option>
                </select>
              </div>
            </div>
          )}

          {/* LLM Configuration Tab */}
          {activeTab === 2 && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">LLM Provider</label>
                <select
                  name="llm_provider"
                  value={config.llm_provider}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama (local)</option>
                  <option value="google">Google</option>
                  <option value="azure_openai">Azure OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="alibaba">Alibaba</option>
                  <option value="moonshot">MoonShot</option>
                  <option value="mistral">Mistral AI</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                <input
                  type="text"
                  name="llm_model_name"
                  value={config.llm_model_name}
                  onChange={handleChange}
                  list="model-options"
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Select or type a model name"
                />
                <datalist id="model-options">
                  {modelOptions.map((model, index) => (
                    <option key={index} value={model}>{model}</option>
                  ))}
                </datalist>
              </div>

              {config.llm_provider === 'ollama' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Context Length</label>
                  <input
                    type="range"
                    name="llm_num_ctx"
                    min="256"
                    max="65536"
                    value={config.llm_num_ctx}
                    onChange={handleChange}
                    className="w-full"
                  />
                  <div className="text-right">{config.llm_num_ctx}</div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                <input
                  type="range"
                  name="llm_temperature"
                  min="0"
                  max="2"
                  step="0.1"
                  value={config.llm_temperature}
                  onChange={handleChange}
                  className="w-full"
                />
                <div className="text-right">{config.llm_temperature}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                  <input
                    type="text"
                    name="llm_base_url"
                    value={config.llm_base_url}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                    placeholder="API endpoint URL (if required)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input
                    type="password"
                    name="llm_api_key"
                    value={config.llm_api_key}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                    placeholder="Your API key (leave blank to use .env)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Browser Settings Tab */}
          {activeTab === 3 && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      name="use_own_browser"
                      checked={config.use_own_browser}
                      onChange={handleChange}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Use Own Browser</span>
                  </label>
                </div>
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      name="keep_browser_open"
                      checked={config.keep_browser_open}
                      onChange={handleChange}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Keep Browser Open</span>
                  </label>
                </div>
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      name="headless"
                      checked={config.headless}
                      onChange={handleChange}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Headless Mode</span>
                  </label>
                </div>
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      name="disable_security"
                      checked={config.disable_security}
                      onChange={handleChange}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Disable Security</span>
                  </label>
                </div>
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      name="enable_recording"
                      checked={config.enable_recording}
                      onChange={handleChange}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2">Enable Recording</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Window Width</label>
                  <input
                    type="number"
                    name="window_w"
                    value={config.window_w}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Window Height</label>
                  <input
                    type="number"
                    name="window_h"
                    value={config.window_h}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recording Path</label>
                <input
                  type="text"
                  name="save_recording_path"
                  value={config.save_recording_path}
                  onChange={handleChange}
                  disabled={!config.enable_recording}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="e.g. ./tmp/record_videos"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Trace Path</label>
                <input
                  type="text"
                  name="save_trace_path"
                  value={config.save_trace_path}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="e.g. ./tmp/traces"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent History Save Path</label>
                <input
                  type="text"
                  name="save_agent_history_path"
                  value={config.save_agent_history_path}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="e.g., ./tmp/agent_history"
                />
              </div>
            </div>
          )}

          {/* Run Agent Tab */}
          {activeTab === 4 && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Description</label>
                <textarea
                  name="task"
                  value={config.task}
                  onChange={handleChange}
                  rows={4}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Enter your task here..."
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Information</label>
                <textarea
                  name="add_infos"
                  value={config.add_infos}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Add any helpful context or instructions..."
                />
              </div>

              <div className="flex gap-4 mb-4">
                <button
                  onClick={handleRunAgent}
                  disabled={isRunning}
                  className={`px-4 py-2 bg-blue-500 text-white rounded-md ${isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
                >
                  ▶️ Run Agent
                </button>
                <button
                  onClick={handleStopAgent}
                  disabled={!isRunning}
                  className={`px-4 py-2 bg-red-500 text-white rounded-md ${!isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600'}`}
                >
                  ⏹️ Stop
                </button>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Live Browser View</label>
                <div 
                  className="border border-gray-300 rounded-md p-2 bg-gray-50"
                  dangerouslySetInnerHTML={{ __html: browserView }}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Output</label>
                <div className="border border-gray-300 rounded-md p-2 bg-gray-50 h-64 overflow-y-auto">
                  {agentOutput.length === 0 ? (
                    <div className="text-gray-500">No output yet. Run the agent to see results.</div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm">
                      {agentOutput.join('\n')}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deep Research Tab */}
          {activeTab === 5 && (
            <div className="p-4 border rounded">
              <h2 className="text-xl font-bold mb-4">Deep Research</h2>
              
              <div className="mb-4">
                <label className="block mb-2">Research Task</label>
                <textarea
                  className="w-full p-2 border rounded"
                  rows={5}
                  value={researchTask}
                  onChange={(e) => setResearchTask(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2">Max Search Iterations</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={maxSearchIteration}
                    onChange={(e) => setMaxSearchIteration(parseInt(e.target.value))}
                    min={1}
                    max={10}
                  />
                </div>
                <div>
                  <label className="block mb-2">Max Queries Per Iteration</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={maxQueryPerIter}
                    onChange={(e) => setMaxQueryPerIter(parseInt(e.target.value))}
                    min={1}
                    max={10}
                  />
                </div>
              </div>
              
              <div className="flex mb-4">
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded mr-2"
                  onClick={handleRunDeepSearch}
                  disabled={isResearchRunning}
                >
                  {isResearchRunning ? 'Running...' : 'Run Deep Research'}
                </button>
                <button
                  className="px-4 py-2 bg-red-500 text-white rounded"
                  onClick={handleStopResearch}
                  disabled={!isResearchRunning}
                >
                  Stop
                </button>
              </div>
              
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Research Output</h3>
                <div 
                  className="p-4 border rounded bg-gray-50 min-h-[300px] max-h-[600px] overflow-auto"
                  dangerouslySetInnerHTML={{ __html: researchOutput }}
                />
              </div>
              
              {researchFilePath && (
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-2">Research File</h3>
                  <div className="p-2 border rounded bg-gray-100">
                    {researchFilePath}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recordings Tab */}
          {activeTab === 6 && (
            <div className="p-4 border rounded">
              <h2 className="text-xl font-bold mb-4">Recordings</h2>
              
              <div className="mb-4">
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded mr-2"
                  onClick={loadRecordings}
                  disabled={isLoadingRecordings}
                >
                  {isLoadingRecordings ? 'Loading...' : 'Refresh Recordings'}
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 border rounded p-2">
                  <h3 className="text-lg font-bold mb-2">Available Recordings</h3>
                  
                  {recordings.length === 0 ? (
                    <p>No recordings found</p>
                  ) : (
                    <ul className="max-h-[500px] overflow-auto">
                      {recordings.map((recording, index) => {
                        const fileName = recording.split('/').pop() || recording.split('\\').pop() || recording;
                        return (
                          <li 
                            key={index}
                            className={`p-2 border-b cursor-pointer hover:bg-gray-100 ${selectedRecording === recording ? 'bg-blue-100' : ''}`}
                            onClick={() => setSelectedRecording(recording)}
                          >
                            {fileName}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                
                <div className="col-span-2 border rounded p-2">
                  <h3 className="text-lg font-bold mb-2">Preview</h3>
                  
                  {selectedRecording ? (
                    <div>
                      <video 
                        controls 
                        className="w-full max-h-[500px]"
                        src={`http://localhost:5000/api/recording/${selectedRecording.split('/').pop() || selectedRecording.split('\\').pop()}?directory=${encodeURIComponent(config.save_recording_path)}`}
                      />
                      <div className="mt-4">
                        <a 
                          href={`http://localhost:5000/api/recording/${selectedRecording.split('/').pop() || selectedRecording.split('\\').pop()}?directory=${encodeURIComponent(config.save_recording_path)}`}
                          className="px-4 py-2 bg-green-500 text-white rounded inline-block"
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download Recording
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p>Select a recording to preview</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Configuration Tab */}
          {activeTab === 7 && (
            <div className="p-4 border rounded">
              <h2 className="text-xl font-bold mb-4">Configuration Management</h2>
              
              <div className="mb-4">
                <label className="block mb-2">Configuration Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-grow p-2 border rounded"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    placeholder="Enter configuration name"
                  />
                  <button
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                    onClick={saveCurrentConfig}
                  >
                    Save Current Config
                  </button>
                </div>
              </div>
              
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Saved Configurations</h3>
                <div className="flex mb-2">
                  <button
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded mr-2"
                    onClick={loadSavedConfigs}
                    disabled={isLoadingConfigs}
                  >
                    {isLoadingConfigs ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
                
                {savedConfigs.length === 0 ? (
                  <p>No saved configurations</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {savedConfigs.map((name, index) => (
                      <div key={index} className="p-3 border rounded flex justify-between items-center">
                        <span>{name}</span>
                        <button
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
                          onClick={() => loadConfig(name)}
                        >
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Tab */}
          {activeTab === 8 && (
            <div className="p-4 border rounded">
              <h2 className="text-xl font-bold mb-4">Agent Results</h2>
              
              <div className="mb-6">
                <label className="block mb-2 font-semibold">Latest Recording</label>
                <div className="aspect-video bg-gray-100 flex items-center justify-center border rounded">
                  {selectedRecording ? (
                    <video 
                      controls 
                      className="w-full max-h-[500px]"
                      src={`http://localhost:5000/api/recording/${selectedRecording.split('/').pop() || selectedRecording.split('\\').pop()}?directory=${encodeURIComponent(config.save_recording_path)}`}
                    />
                  ) : (
                    <p className="text-gray-500">No recording available</p>
                  )}
                </div>
              </div>
              
              <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 font-semibold">Final Result</label>
                  <div className="p-3 border rounded bg-gray-50 min-h-[100px] max-h-[200px] overflow-auto">
                    {finalResult || <span className="text-gray-500">No final result available</span>}
                  </div>
                </div>
                <div>
                  <label className="block mb-2 font-semibold">Errors</label>
                  <div className="p-3 border rounded bg-gray-50 min-h-[100px] max-h-[200px] overflow-auto">
                    {errors || <span className="text-gray-500">No errors</span>}
                  </div>
                </div>
                <div>
                  <label className="block mb-2 font-semibold">Model Actions</label>
                  <div className="p-3 border rounded bg-gray-50 min-h-[100px] max-h-[200px] overflow-auto">
                    {modelActions || <span className="text-gray-500">No model actions available</span>}
                  </div>
                </div>
                <div>
                  <label className="block mb-2 font-semibold">Model Thoughts</label>
                  <div className="p-3 border rounded bg-gray-50 min-h-[100px] max-h-[200px] overflow-auto">
                    {modelThoughts || <span className="text-gray-500">No model thoughts available</span>}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {traceFilePath && (
                  <div>
                    <label className="block mb-2 font-semibold">Trace File</label>
                    <div className="p-3 border rounded bg-gray-100">
                      <p className="mb-2 truncate">{traceFilePath}</p>
                      <a 
                        href={`file://${traceFilePath}`}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm inline-block"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open File
                      </a>
                    </div>
                  </div>
                )}
                
                {agentHistoryFilePath && (
                  <div>
                    <label className="block mb-2 font-semibold">Agent History</label>
                    <div className="p-3 border rounded bg-gray-100">
                      <p className="mb-2 truncate">{agentHistoryFilePath}</p>
                      <a 
                        href={`file://${agentHistoryFilePath}`}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm inline-block"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open File
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 