resource "aws_sesv2_email_identity" "identity" {
  count = var.identity_enabled ? 1 : 0

  email_identity = var.ses_email_identity
}

resource "aws_cognito_user_pool" "identity" {
  count = var.identity_enabled ? 1 : 0

  name           = "${var.identity_name}-users"
  user_pool_tier = "ESSENTIALS"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD", "EMAIL_OTP"]
  }

  software_token_mfa_configuration {
    enabled = true
  }

  email_configuration {
    email_sending_account = "DEVELOPER"
    from_email_address    = var.ses_from_address
    source_arn            = aws_sesv2_email_identity.identity[0].arn
  }
}

resource "aws_cognito_user_pool_client" "application" {
  count = var.identity_enabled ? 1 : 0

  name         = "${var.identity_name}-application"
  user_pool_id = aws_cognito_user_pool.identity[0].id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
  explicit_auth_flows           = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  supported_identity_providers  = ["COGNITO"]
  access_token_validity         = 15
  id_token_validity             = 15
  refresh_token_validity        = 1

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

output "cognito_user_pool_id" {
  value = var.identity_enabled ? aws_cognito_user_pool.identity[0].id : null
}

output "cognito_client_id" {
  value = var.identity_enabled ? aws_cognito_user_pool_client.application[0].id : null
}
