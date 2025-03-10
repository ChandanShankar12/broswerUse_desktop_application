export interface AgentConfig {
  agent_type: string;
  max_steps: number;
  max_actions_per_step: number;
  use_vision: boolean;
  tool_calling_method: string;
  
  // LLM Configuration
  llm_provider: string;
  llm_model_name: string;
  llm_num_ctx: number;
  llm_temperature: number;
  llm_base_url: string;
  llm_api_key: string;
  
  // Browser Settings
  use_own_browser: boolean;
  keep_browser_open: boolean;
  headless: boolean;
  disable_security: boolean;
  enable_recording: boolean;
  window_w: number;
  window_h: number;
  save_recording_path: string;
  save_trace_path: string;
  save_agent_history_path: string;
  
  // Task
  task: string;
  add_infos: string;
} 