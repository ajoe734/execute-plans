export interface TruthSourceInfo {
  truth_level: string;
  truth_bucket?: string;
  source_type?: string;
  label: string;
  description?: string;
  rank: number;
  status: string;
  source: string;
  evidence_basis?: string;
  evidence_bases?: string[];
  runtime_controller_record_qualified?: boolean;
  catalog_claim_eligible?: boolean;
  refs?: string[];
  note?: string;
  accepted_as_live?: boolean;
  is_live_truth_level?: boolean;
  operator_note?: string;
  operator_visibility?: string;
}

export interface OperatorTruthSource {
  truth_level: string;
  truth_bucket?: string;
  source_type?: string;
  source: string;
  rank: number;
  status: string;
  label: string;
  description?: string;
  accepted_as_live: boolean;
  is_live_truth: boolean;
  degraded: boolean;
  degraded_reason?: string | null;
  highest_available_truth_level?: string;
  highest_available_source?: string;
  highest_available_label?: string;
  truth_labels?: Record<string, {
    truth_level: string;
    truth_bucket: string;
    source_type: string;
    rank: number;
    label: string;
    description: string;
    accepted_as_live: boolean;
  }>;
}

export interface ControllerContractDeclaration {
  status: string;
  controller_implemented: boolean;
  controller_name?: string | null;
  contract_complete: boolean;
  missing_contract_fields: string[];
  declared_only: boolean;
  note?: string;
}

export interface LoopInventoryEntryDTO {
  id: string;
  loop_id: string;
  classification: "canonical" | "composite_overlay";
  composed_of?: string[];
  name: string;
  policy_ref?: Record<string, unknown>;
  owner?: {
    primary_lane?: string;
    team?: string;
    contact?: string;
  };
  trigger_model?: {
    kind?: string;
    continuous?: boolean;
    frequency?: string;
  };
  desired_state?: Record<string, unknown>;
  actual_state?: Record<string, unknown>;
  maturity?: {
    current: string;
    target: string;
  };
  current_maturity: string;
  target_maturity: string;
  controller?: {
    status?: string;
    controller_name?: string;
    desired_state_query?: string;
    actual_state_query?: string;
    restart_behavior?: string;
    liveness_metric?: string;
  };
  evidence?: Record<string, unknown>;
  evidence_statuses?: Record<string, string>;
  execution_tasks?: Array<{
    id?: string;
    task_id?: string;
    repo?: string;
    status?: string;
  }>;
  maturity_projection?: {
    source?: string;
    declared_only?: boolean;
    eligible_live_truth_levels?: string[];
    task_completion_policy?: string;
    archived_task_completion_accepted?: boolean;
  };
  controller_contract_declaration?: ControllerContractDeclaration;
  truth_source?: {
    level?: string;
    source?: string;
    registry_ref?: string;
    live_truth_levels?: string[];
  };
  live_status?: {
    is_live: boolean;
    is_reconciled: boolean;
    has_live_evidence: boolean;
    catalog_claim_eligible: boolean;
    reason?: string;
  };
}

export interface ControllerHealthDetail {
  status: string;
  source: string;
  reported_status?: string;
  reported_source?: string;
  evidence_basis?: string;
  evidence_bases?: string[];
  runtime_evidence_refs?: string[];
  runtime_record_qualified?: boolean;
  rejection_reason?: string | null;
  freshness?: {
    is_fresh?: boolean;
    last_heartbeat_at?: string;
    age_seconds?: number;
  };
}

export interface LoopHealthEntryDTO extends LoopInventoryEntryDTO {
  read_model: "loop_health";
  controller_health: ControllerHealthDetail;
  evidence_packet?: Record<string, unknown>;
  truth_sources?: TruthSourceInfo[];
  highest_present_truth_source?: TruthSourceInfo;
  operator_truth_source?: OperatorTruthSource;
}

export interface LoopInventoryListEnvelope {
  data: LoopInventoryEntryDTO[];
  items: LoopInventoryEntryDTO[];
  page_info: {
    total_count: number;
    total_count_exact: boolean;
  };
  meta: Record<string, unknown>;
}

export interface LoopInventoryDetailEnvelope {
  data: LoopInventoryEntryDTO;
  meta: Record<string, unknown>;
}

export interface LoopHealthListEnvelope {
  data: LoopHealthEntryDTO[];
  items: LoopHealthEntryDTO[];
  page_info: {
    total_count: number;
    total_count_exact: boolean;
  };
  meta: Record<string, unknown>;
}

export interface LoopHealthDetailEnvelope {
  data: LoopHealthEntryDTO;
  meta: Record<string, unknown>;
}
