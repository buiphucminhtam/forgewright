import hash_util
import hashlib
import os

open("temp.txt", "w").write("hello")
try:
    assert hash_util.get_file_hash("temp.txt") == hashlib.sha256(b"hello").hexdigest()
    assert hash_util.get_file_hash("nonexistent.txt") is None
    print("ALL TESTS PASSED")
finally:
    if os.path.exists("temp.txt"):
        os.remove("temp.txt")
