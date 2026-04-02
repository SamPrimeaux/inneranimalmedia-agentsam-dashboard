import os
import hashlib
import argparse
from collections import defaultdict
from tabulate import tabulate

def calculate_sha256(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def find_duplicates(directory):
    hash_map = defaultdict(list)
    for root, _, files in os.walk(directory):
        for name in files:
            file_path = os.path.join(root, name)
            file_hash = calculate_sha256(file_path)
            hash_map[file_hash].append(file_path)
    return {h: paths for h, paths in hash_map.items() if len(paths) > 1}

def print_summary(duplicates):
    summary = []
    for file_hash, paths in duplicates.items():
        summary.append([file_hash, len(paths), paths])
    print(tabulate(summary, headers=["SHA-256", "Count", "Files"], tablefmt="grid"))

def delete_duplicates(duplicates):
    for paths in duplicates.values():
        for file_path in paths[1:]:
            os.remove(file_path)

def main():
    parser = argparse.ArgumentParser(description="Find and manage duplicate files by SHA-256 hash.")
    parser.add_argument("directory", help="Directory to scan for duplicate files.")
    parser.add_argument("--delete", action="store_true", help="Delete duplicate files, keeping the first found.")
    args = parser.parse_args()

    duplicates = find_duplicates(args.directory)
    print_summary(duplicates)

    if args.delete:
        delete_duplicates(duplicates)

if __name__ == "__main__":
    main()