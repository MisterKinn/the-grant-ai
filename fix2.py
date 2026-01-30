#!/usr/bin/env python3
import zipfile
import os

TEMPLATE_DIR = '/tmp/hwpx_2026_fresh'
OUTPUT_PATH = '/Users/kinn/Desktop/thegrantai/public/template_2026_early.hwpx'

# HWPX file order should match 2025 exactly
FILE_ORDER = [
    'mimetype',
    'version.xml',
    'Contents/header.xml',
    'Contents/section0.xml',
    'Preview/PrvText.txt',
    'Scripts/headerScripts',
    'Scripts/sourceScripts',
    'settings.xml',
    'Preview/PrvImage.png',
    'META-INF/container.rdf',
    'Contents/content.hpf',
    'META-INF/container.xml',
    'META-INF/manifest.xml',
]

with zipfile.ZipFile(OUTPUT_PATH, 'w') as zf:
    for fname in FILE_ORDER:
        full_path = os.path.join(TEMPLATE_DIR, fname)
        if not os.path.exists(full_path):
            print(f'Warning: {fname} not found')
            continue
        
        if fname == 'mimetype' or fname.endswith('.png'):
            compress = zipfile.ZIP_STORED
        else:
            compress = zipfile.ZIP_DEFLATED
        
        zf.write(full_path, fname, compress_type=compress)
        print(f'Added: {fname}')

print('Done! Template recreated with correct file order.')
