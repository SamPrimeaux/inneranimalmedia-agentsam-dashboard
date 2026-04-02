#!/usr/bin/env python3
import argparse
import hashlib
import os
import sys
from collections import defaultdict

def compute_sha256(path: str, chunk_size: int = 8192) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()

def find_duplicates(root: str) -> dict[str, list[str]]:
    hashes = defaultdict(list)
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            full_path = os.path.join(dirpath, name)
            if not os.path.islink(full_path) and os.path.isfile(full_path):
                try:
                    file_hash = compute_sha256(full_path)
                    hashes[file_hash].append(full_path)
                except (OSError, PermissionError):
                    pass
    return {h: paths for h, paths in hashes.items() if len(paths) > 1}

def print_summary(dupes: dict[str, list[str]]) -> None:
    print(f"{'Set #':<6} {'Count':<6} {'SHA-256':<64} {'Files'}")
    print("-" * 100)
    for i, (h, paths) in enumerate(dupes.items(), 1):
        print(f"{i:<6} {len(paths):<6} {h:<64} {paths[0]}")
        for p in paths[1:]:
            print(f"{'':<78} {p}")
    print(f"\nTotal duplicate sets: {len(dupes)}")

def delete_duplicates(dupes: dict[str, list[str]]) -> None:
    for paths in dupes.values():
        for p in paths[1:]:
            try:
                os.remove(p)
            except (OSError, PermissionError) as e:
                print(f"Failed to delete {p}: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Find and optionally delete duplicate files by SHA-256 hash.")
    parser.add_argument("directory", help="Directory to scan recursively")
    parser.add_argument("--delete", action="store_true", help="Delete duplicates, keep first found")
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Error: {args.directory} is not a directory or cannot be accessed.", file=sys.stderr)
        sys.exit(1)

    dupes = find_duplicates(args.directory)
    if not dupes:
        print("No duplicate files found.")
        return

    print_summary(dupes)

    if args.delete:
        confirm = input("Are you sure you want to delete duplicates? This cannot be undone! [y/N]: ")
        if confirm.lower() == 'y':
            delete_duplicates(dupes)
            print("Duplicates deleted.")
        else:
            print("Deletion aborted.")

if __name__ == "__main__":
    main()