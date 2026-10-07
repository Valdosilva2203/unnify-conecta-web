#!/bin/bash

PROJECT_REF="bvwfoafkqjquxcbijffj"
SERVICE_ROLE_KEY="sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW"
SUPABASE_URL="https://bvwfoafkqjquxcbijffj.supabase.co"

USER_IDS=(
  "c707e215-7c1b-4121-bfd5-b9ea1f4dfc40"
  "bb09da19-7a7d-423e-bb33-f3ad54e8ecd0"
  "4f2fa7d2-8b8f-430b-96f6-7097ceabb13c"
)

for USER_ID in "${USER_IDS[@]}"; do
  echo "Deletando usuário: $USER_ID"
  curl -X DELETE \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" 2>&1 | head -20
done
