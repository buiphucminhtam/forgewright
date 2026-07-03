import safe_logger


def test_sanitize():
    msg = "User logged in with key sk-12345678901234567890123456789012 and token key-abcdefghijklmnopqrstuvwxyz123456"
    expected = "User logged in with key [REDACTED] and token [REDACTED]"
    assert safe_logger.sanitize_log(msg) == expected

    msg_normal = "Normal log message without keys"
    assert safe_logger.sanitize_log(msg_normal) == msg_normal


if __name__ == "__main__":
    test_sanitize()
    print("ALL TESTS PASSED")
