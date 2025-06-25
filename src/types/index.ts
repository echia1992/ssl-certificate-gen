export interface CertificateRequest {
  domain: string;
  email: string;
  includeWildcard: boolean;
}

export interface CertificateResponse {
  success: boolean;
  message: string;
  dnsRecords?: DNSRecord[];
  certificatePath?: string;
  error?: string;
}

export interface DNSRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

export interface DNSVerificationResponse {
  verified: boolean;
  records: DNSRecord[];
  pendingRecords: DNSRecord[];
}

export enum CertificateStatus {
  IDLE = "idle",
  REQUESTING = "requesting",
  DNS_PENDING = "dns_pending",
  VERIFYING = "verifying",
  SUCCESS = "success",
  ERROR = "error",
}
