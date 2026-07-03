import subprocess


def run_ping(hostname):
    # Vulnerable shell=True
    cmd = f"ping -c 1 {hostname}"
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return res.stdout
