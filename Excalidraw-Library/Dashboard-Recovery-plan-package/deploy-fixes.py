#!/usr/bin/env python3
"""
Dashboard Recovery Deployment Script
Uploads fixed files to Cloudflare R2 (agent-sam bucket)
"""

import requests
import json
import os

# Configuration
API_TOKEN = "WP617_R8MZAD-_3fQ_Y-COJeZi1GS4IYG3aNKCtb"
ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
BUCKET = "agent-sam"
BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects"

def upload_to_r2(file_path, r2_key, content_type="text/html"):
    """Upload a file to Cloudflare R2"""
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return False
    
    print(f"📤 Uploading: {file_path} → {r2_key}")
    
    with open(file_path, 'rb') as f:
        file_content = f.read()
    
    url = f"{BASE_URL}/{r2_key}"
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": content_type
    }
    
    try:
        response = requests.put(url, headers=headers, data=file_content)
        result = response.json()
        
        if result.get('success'):
            print(f"✅ Success! Uploaded {len(file_content)} bytes\n")
            return True
        else:
            errors = result.get('errors', [{'message': 'Unknown error'}])
            print(f"❌ Failed: {errors[0].get('message', 'Unknown error')}\n")
            return False
            
    except Exception as e:
        print(f"❌ Error: {str(e)}\n")
        return False

def main():
    print("🚀 Inner Animal Media Dashboard Recovery Deployment")
    print("=" * 50)
    print()
    
    deployments = [
        {
            "name": "Enhanced Auth Sign-In Page",
            "description": [
                "More white/semi-transparent glassmorphic styling",
                "Improved hover effects",
                "Better visual hierarchy"
            ],
            "file": "auth-signin-FIXED.html",
            "r2_key": "auth-signin.html"
        },
        {
            "name": "Enhanced Agent Dashboard",
            "description": [
                "Added conversation depth tracker",
                "Improved footer layout",
                "Real-time metrics ready"
            ],
            "file": "agent-FIXED.html",
            "r2_key": "dashboard/agent.html"
        }
    ]
    
    success_count = 0
    total = len(deployments)
    
    for i, deployment in enumerate(deployments, 1):
        print(f"{i}️⃣ Deploying: {deployment['name']}")
        for desc in deployment['description']:
            print(f"   - {desc}")
        print()
        
        if upload_to_r2(deployment['file'], deployment['r2_key']):
            success_count += 1
    
    # Summary
    print("=" * 50)
    if success_count == total:
        print("✨ Deployment Complete!")
    else:
        print(f"⚠️  Partial Deployment: {success_count}/{total} succeeded")
    print()
    
    print("🔗 Test your changes:")
    print("   Auth:  https://inneranimalmedia.com/auth/signin")
    print("   Agent: https://inneranimalmedia.com/dashboard/agent")
    print()
    
    print("📋 Next steps:")
    print("   1. Test the deployed pages")
    print("   2. Review DASHBOARD_RECOVERY_PLAN.md for remaining fixes")
    print("   3. Fix critical pages: MCP, Cloud, Images, Kanban")
    print("   4. Launch next week 🎯")
    print()
    
    return success_count == total

if __name__ == "__main__":
    main()
