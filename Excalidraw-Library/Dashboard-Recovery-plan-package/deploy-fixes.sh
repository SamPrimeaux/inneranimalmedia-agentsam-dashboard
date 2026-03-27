#!/bin/bash

# Dashboard Recovery Deployment Script
# Uploads fixed files to Cloudflare R2 (agent-sam bucket)

API_TOKEN="WP617_R8MZAD-_3fQ_Y-COJeZi1GS4IYG3aNKCtb"
ACCOUNT_ID="ede6590ac0d2fb7daf155b35653457b2"
BUCKET="agent-sam"

echo "🚀 Inner Animal Media Dashboard Recovery Deployment"
echo "=================================================="
echo ""

# Function to upload file to R2
upload_to_r2() {
    local file_path=$1
    local r2_key=$2
    local content_type=$3
    
    echo "📤 Uploading: $file_path → $r2_key"
    
    curl -X PUT \
        "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/objects/$r2_key" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: $content_type" \
        --data-binary @"$file_path" \
        -s | python3 -c "import sys, json; data = json.load(sys.stdin); print('✅ Success' if data.get('success') else '❌ Failed: ' + str(data.get('errors', 'Unknown error')))"
    
    echo ""
}

# Deploy auth-signin.html
echo "1️⃣ Deploying Enhanced Auth Sign-In Page"
echo "   - More white/semi-transparent glassmorphic styling"
echo "   - Improved hover effects"
echo ""
upload_to_r2 "auth-signin-FIXED.html" "auth-signin.html" "text/html"

# Deploy agent.html
echo "2️⃣ Deploying Enhanced Agent Dashboard"
echo "   - Added conversation depth tracker"
echo "   - Improved footer layout"
echo "   - Real-time metrics ready"
echo ""
upload_to_r2 "agent-FIXED.html" "dashboard/agent.html" "text/html"

# Summary
echo "=================================================="
echo "✨ Deployment Complete!"
echo ""
echo "🔗 Test your changes:"
echo "   Auth:  https://inneranimalmedia.com/auth/signin"
echo "   Agent: https://inneranimalmedia.com/dashboard/agent"
echo ""
echo "📋 Next steps:"
echo "   1. Test the deployed pages"
echo "   2. Review DASHBOARD_RECOVERY_PLAN.md for remaining fixes"
echo "   3. Fix critical pages: MCP, Cloud, Images, Kanban"
echo "   4. Launch next week 🎯"
echo ""
