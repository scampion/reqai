#!/usr/bin/env python3
"""
Download all files from a GitHub repository's main branch.
Usage: python3 download_repo.py [output_dir]
"""

import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urljoin

BASE_URL = "https://raw.githubusercontent.com/scampion/reqai/refs/heads/main/"

def download_file(url, local_path):
    """Download a single file from URL to local path"""
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with urllib.request.urlopen(url) as response, open(local_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Downloaded: {local_path}")
    except urllib.error.HTTPError as e:
        print(f"Failed to download {url}: {e}")
    except OSError as e:
        print(f"Failed to create directory for {local_path}: {e}")

def discover_and_download_files(base_url, output_dir="."):
    """Discover and download all files from the repository"""
    # List of known files from the repository
    known_files = [
        ".gitignore",
        "README.md",
        "api.py",
        "app.js",
        "index.html",
        "requirements_data.json",
        "img/image-20250401211018512.png"
    ]
    
    for file_path in known_files:
        file_url = urljoin(base_url, file_path)
        local_path = os.path.join(output_dir, file_path)
        download_file(file_url, local_path)

if __name__ == "__main__":
    output_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    print(f"Downloading repository files to: {output_dir}")
    discover_and_download_files(BASE_URL, output_dir)
