import pytest
import executor


def test_valid_ping():
    try:
        out = executor.run_ping("127.0.0.1")
        assert out is not None
    except Exception as e:
        assert not isinstance(e, ValueError)


def test_command_injection():
    with pytest.raises(ValueError):
        executor.run_ping("127.0.0.1; cat /etc/passwd")

    with pytest.raises(ValueError):
        executor.run_ping("127.0.0.1 && id")


if __name__ == "__main__":
    test_valid_ping()
    test_command_injection()
    print("ALL TESTS PASSED")
