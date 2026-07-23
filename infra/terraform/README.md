# Terraform

Terraform is the approved infrastructure-as-code tool for AWS production.

Identity resources are declared but disabled by default with
`identity_enabled = false`. A production plan must explicitly enable them and
provide the SES identity/from address. Cognito Essentials is required for email
OTP, public self-registration remains disabled, and application policy enforces
TOTP for privileged users.

Do not apply this configuration until production cost caps and named owners for
alerts, restores, security updates, key rotation, and incidents are approved.
