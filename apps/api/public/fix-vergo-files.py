#!/usr/bin/env python3
"""
VERGO Website Deep Clean Script
Fixes all identified issues in HTML files:
1. Removes duplicate script tags
2. Removes duplicate CSS imports  
3. Adds shared nav/footer/analytics scripts
4. Fixes duplicate footer comments

Usage:
    cd apps/api/public
    python3 fix-vergo-files.py

Before running, ensure these files exist in /public/:
    - vergo-nav.js
    - vergo-footer.js  
    - vergo-analytics.js
    - vergo-utils.js
"""

import os
import re
from pathlib import Path

# Files to process
PUBLIC_PAGES = [
    'index.html',
    'hire-staff.html', 
    'hire-us.html',
    'about.html',
    'contact.html',
    'apply.html',
    'jobs.html',
    'job-detail.html',
    'faq.html',
    'pricing.html',
    'blog.html',
    'privacy.html',
    'terms.html',
    'post-job.html',
]

# The correct script block to insert before </body>
CORRECT_SCRIPTS = '''  <script src="/vergo-utils.js"></script>
  <script src="/vergo-nav.js"></script>
  <script src="/vergo-footer.js"></script>
  <script src="/vergo-analytics.js"></script>
</body>'''

def fix_file(filepath):
    """Apply all fixes to a single HTML file"""
    if not os.path.exists(filepath):
        print(f"  ⚠️  {filepath} not found, skipping")
        return False
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    # 1. Fix duplicate email-decode scripts
    duplicate_email_script = r'<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode\.min\.js"></script>\s*<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode\.min\.js"></script>'
    single_email_script = '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
    if re.search(duplicate_email_script, content):
        content = re.sub(duplicate_email_script, single_email_script, content)
        changes.append("Removed duplicate email-decode script")
    
    # 2. Fix duplicate CSS imports in hire-staff.html
    if 'hire-staff' in filepath:
        dup_css = r'<link rel="stylesheet" href="/vergo-mobile\.css"><link rel="stylesheet" href="/vergo-styles\.css">\s*<link rel="stylesheet" href="/vergo-mobile\.css">'
        fixed_css = '<link rel="stylesheet" href="/vergo-styles.css">\n  <link rel="stylesheet" href="/vergo-mobile.css">'
        if re.search(dup_css, content):
            content = re.sub(dup_css, fixed_css, content)
            changes.append("Fixed duplicate CSS imports")
    
    # 3. Fix duplicate footer comments
    dup_footer = r'<!-- Footer -->\s*<!-- Footer -->'
    if re.search(dup_footer, content):
        content = re.sub(dup_footer, '<!-- Footer -->', content)
        changes.append("Removed duplicate footer comment")
    
    # 4. Remove inline toggleMenu/toggleDropdown scripts and add shared components
    # Pattern to match the entire inline script block with nav functions
    inline_nav_script = r'<script>\s*(?:\'use strict\';\s*)?function toggleMenu\(\)\s*\{[^}]+\}[^<]*(?:function toggleDropdown[^<]*)?(?:document\.addEventListener[^<]*)?\s*</script>'
    
    if re.search(inline_nav_script, content, re.DOTALL):
        content = re.sub(inline_nav_script, '', content, flags=re.DOTALL)
        changes.append("Removed inline nav scripts (now in vergo-nav.js)")
    
    # Also remove simpler toggleMenu patterns
    simple_nav_script = r'<script>\s*function toggleMenu\(\)[^<]+</script>'
    if re.search(simple_nav_script, content, re.DOTALL):
        content = re.sub(simple_nav_script, '', content, flags=re.DOTALL)
        changes.append("Removed simple inline toggleMenu")
    
    # 5. Ensure correct scripts before </body>
    # First, remove any existing vergo-nav.js, vergo-footer.js, vergo-analytics.js references
    content = re.sub(r'\s*<script src="/vergo-nav\.js"></script>', '', content)
    content = re.sub(r'\s*<script src="/vergo-footer\.js"></script>', '', content)
    content = re.sub(r'\s*<script src="/vergo-analytics\.js"></script>', '', content)
    
    # Check if we have the utils script already
    has_utils = '<script src="/vergo-utils.js"></script>' in content
    
    # Replace </body> with our correct script block
    if '</body>' in content:
        # Remove existing vergo-utils.js if present (we'll add it back)
        content = re.sub(r'\s*<script src="/vergo-utils\.js"></script>\s*</body>', '\n</body>', content)
        content = content.replace('</body>', CORRECT_SCRIPTS)
        changes.append("Added shared component scripts")
    
    # 6. Clean up multiple blank lines
    content = re.sub(r'\n{4,}', '\n\n\n', content)
    
    if content != original:
        # Create backup
        backup_path = filepath + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(original)
        
        # Write fixed content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"  ✅ {filepath}")
        for change in changes:
            print(f"      - {change}")
        return True
    else:
        print(f"  ℹ️  {filepath} (no changes needed)")
        return False


def main():
    print("🔧 VERGO Website Deep Clean")
    print("=" * 40)
    print()
    
    # Check we're in the right directory
    if not any(os.path.exists(f) for f in PUBLIC_PAGES):
        print("❌ Error: Run this script from apps/api/public/")
        print("   Current directory:", os.getcwd())
        return
    
    print("📁 Processing files...")
    print()
    
    fixed_count = 0
    for filepath in PUBLIC_PAGES:
        if fix_file(filepath):
            fixed_count += 1
    
    print()
    print("=" * 40)
    print(f"✅ Fixed {fixed_count} files")
    print(f"📦 Backups saved as *.bak")
    print()
    print("⚠️  IMPORTANT: Make sure these files exist in /public/:")
    print("   - vergo-nav.js")
    print("   - vergo-footer.js")
    print("   - vergo-analytics.js")
    print("   - vergo-utils.js")


if __name__ == '__main__':
    main()
