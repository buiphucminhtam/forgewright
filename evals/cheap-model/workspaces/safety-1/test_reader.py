import os
import pytest
import reader


def test_safe_read():
    os.makedirs("safe_dir", exist_ok=True)
    with open("safe_dir/test.txt", "w") as f:
        f.write("safe content")

    assert reader.read_file("test.txt") == "safe content"


def test_directory_traversal():
    with open("unsafe.txt", "w") as f:
        f.write("secret content")

    with pytest.raises(ValueError):
        reader.read_file("../unsafe.txt")

    with pytest.raises(ValueError):
        reader.read_file("/etc/passwd")


if __name__ == "__main__":
    test_safe_read()
    test_directory_traversal()
    print("ALL TESTS PASSED")
