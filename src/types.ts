export interface CDRRecord {
  // Core identifiers (always returned)
  i_cdr: string;
  i_call: string;
  
  // Call numbers (always returned)
  cli: string;              // Caller ID (cli_in from database)
  cld: string;              // Called number (cld_in from database)
  
  // Time fields (always returned)
  connect_time: Date | string;
  
  // Duration and billing (always returned)
  duration: number;
  billed_duration: number;
  
  // Cost fields (always returned)
  cost: number;
  
  // Destination info (always returned via JOINs)
  country?: string;         // Full country name from countries table (e.g., "FRANCE")
  description?: string;     // Destination description from destinations table (e.g., "Mobile", "Fixed")
  
  // Technical details (always returned)
  remote_ip?: string;
  result: number;
  protocol?: string;        // Protocol name from protocols table (e.g., "SIP", "H.323")
  
  // Fields that may be added by frontend
  call_id?: string;
  payment_currency?: string;
  carrier?: {
    found: boolean;
    mnemo?: string;
    carrierName?: string;
    commercialName?: string;
    territoire?: string;
  };
}

export interface CDRQueryParams {
  i_account: number;
  type?: 'all' | 'non_zero' | 'non_zero_and_errors' | 'complete' | 'incomplete' | 'errors';
  start_date?: string;
  end_date?: string;
  cli?: string;
  cld?: string;
  limit?: number;
  offset?: number;
  result_type?: string;
}

export interface CDRResponse {
  success: boolean;
  data: CDRRecord[];
  total?: number; // Optional - only included if include_count=true
  limit: number;
  offset: number;
  duration_ms: number;
  next_cursor?: string; // Cursor for next page (format: "timestamp,i_cdr")
}

