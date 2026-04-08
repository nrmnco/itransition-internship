import hashlib
import os
from math import prod

DIR = "/home/nrmn/Desktop/itransition/task2/data"
EMAIL = "issayevnariman@gmail.com".lower()

def sha3_256_bytes(data: bytes) -> str:
    return hashlib.sha3_256(data).hexdigest()

def sort_key(h: str):
    return prod((int(c, 16) + 1) for c in h)

hashes = []

for root, _, files in os.walk(DIR):
    for file in files:
        path = os.path.join(root, file)

        with open(path, "rb") as f:
            data = f.read()

        h = sha3_256_bytes(data)
        hashes.append(h)

hashes.sort(key=sort_key)

joined = "".join(hashes)

final_string = joined + EMAIL

result = hashlib.sha3_256(final_string.encode()).hexdigest()

print(result)