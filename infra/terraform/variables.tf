variable "aws_region" {
  description = "AWS region for Cognito and SES."
  type        = string
  default     = "us-east-1"
}

variable "identity_enabled" {
  description = "Explicit production opt-in for Cognito and SES resources."
  type        = bool
  default     = false
}

variable "identity_name" {
  description = "Stable resource name prefix."
  type        = string
  default     = "camp-registration"
}

variable "ses_email_identity" {
  description = "Verified SES domain or mailbox used for Cognito delivery."
  type        = string
  default     = ""

  validation {
    condition     = !var.identity_enabled || length(trimspace(var.ses_email_identity)) > 0
    error_message = "ses_email_identity is required when identity_enabled is true."
  }
}

variable "ses_from_address" {
  description = "From address presented by Cognito email."
  type        = string
  default     = ""

  validation {
    condition     = !var.identity_enabled || length(trimspace(var.ses_from_address)) > 0
    error_message = "ses_from_address is required when identity_enabled is true."
  }
}
