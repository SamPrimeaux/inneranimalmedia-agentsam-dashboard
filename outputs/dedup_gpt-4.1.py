import argparse
import hashlib
import os
import sys
from collections import defaultdict

def compute_sha256(filepath, chunk_size=65536):
    sha256 = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                sha256.update(chunk)
    except Exception as e:
        print(f"Error reading {filepath}: {e}", file=sys.stderr)
        return None
    return sha256.hexdigest()

def scan_directory(root_dir):
    hash_to_files = defaultdict(list)
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if os.path.islink(filepath) or not os.path.isfile(filepath):
                continue
            file_hash = compute_sha256(filepath)
            if file_hash:
                hash_to_files[file_hash].append(filepath)
    return hash_to_files

def print_summary_table(duplicates):
    if not duplicates:
        print("No duplicate files found.")
        return
    print(f"{'Set':<5} {'SHA-256':<64} {'Files'}")
    print("-" * 80)
    for idx, (file_hash, files) in enumerate(duplicates.items(), 1):
        print(f"{idx:<5} {file_hash:<64} {files[0]}")
        for f in files[1:]:
            print(f"{'':<70} {f}")
        print("-" * 80)

def delete_duplicates(duplicates):
    deleted = 0
    for files in duplicates.values():
        # Keep the first file, delete the rest
        for dup_file in files[1:]:
            try:
                os.remove(dup_file)
                print(f"Deleted: {dup_file}")
                deleted += 1
            except Exception as e:
                print(f"Failed to delete {dup_file}: {e}", file=sys.stderr)
    print(f"Deleted {deleted} duplicate files.")

def main():
    parser = argparse.ArgumentParser(
        description="Recursively scan a directory for duplicate files by SHA-256 hash."
    )
    parser.add_argument(
        "directory",
        help="Directory to scan for duplicate files"
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete duplicate files (keep the first found in each set)"
    )
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Error: {args.directory} is not a valid directory.", file=sys.stderr)
        sys.exit(1)

    hash_to_files = scan_directory(args.directory)
    duplicates = {h: files for h, files in hash_to_files.items() if len(files) > 1}

    print_summary_table(duplicates)

    if args.delete and duplicates:
        confirm = input("Are you sure you want to delete duplicates? [y/N]: ")
        if confirm.lower() == "y":
            delete_duplicates(duplicates)
        else:
            print("Deletion cancelled.")

if __name__ == "__main__":
    main()