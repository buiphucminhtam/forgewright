def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True


def factorial(n):
    if n < 0:
        raise ValueError("Negative input not allowed")
    if n == 0 or n == 1:
        return 1
    return n * factorial(n - 1)
