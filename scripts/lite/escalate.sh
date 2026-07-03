#!/usr/bin/env bash
# scripts/lite/escalate.sh
# Cascade router that spawns a stronger model for hard tasks, logs token cost, and returns output.
# Works on macOS and Windows/Git-Bash.

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Call the embedded Python cascade router
python3 - "$@" << 'EOF'
import sys
import os
import json
import time
import urllib.request
import urllib.error

# Colors
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
BLUE = '\033[0;34m'
NC = '\033[0m'

def log_info(msg):
    sys.stderr.write(f"{GREEN}[ESCALATE]{NC} {msg}\n")

def log_warn(msg):
    sys.stderr.write(f"{YELLOW}[ESCALATE] WARNING:{NC} {msg}\n")

def log_error(msg):
    sys.stderr.write(f"{RED}[ESCALATE] ERROR:{NC} {msg}\n")

def main():
    # Parse simple arguments
    args = sys.argv[1:]
    model_override = None
    provider_override = None
    mode = "hard-task"
    skill = "escalate"
    
    # Extract flag arguments
    filtered_args = []
    i = 0
    while i < len(args):
        if args[i] == '--model' and i + 1 < len(args):
            model_override = args[i+1]
            i += 2
        elif args[i] == '--provider' and i + 1 < len(args):
            provider_override = args[i+1]
            i += 2
        elif args[i] == '--mode' and i + 1 < len(args):
            mode = args[i+1]
            i += 2
        elif args[i] == '--skill' and i + 1 < len(args):
            skill = args[i+1]
            i += 2
        else:
            filtered_args.append(args[i])
            i += 1
            
    # Get prompt from arguments or stdin
    if filtered_args:
        prompt = " ".join(filtered_args)
    else:
        log_info("Reading prompt from stdin...")
        prompt = sys.stdin.read()
        
    if not prompt.strip():
        log_error("Empty prompt. Nothing to escalate.")
        sys.exit(1)
        
    # Detect API keys
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    
    # Build list of options to try in priority order
    options = []
    
    # Anthropic
    if anthropic_key and (not provider_override or provider_override == "anthropic"):
        options.append({
            "provider": "anthropic",
            "model": model_override or "claude-3-5-sonnet-20241022",
            "key": anthropic_key,
            "url": "https://api.anthropic.com/v1/messages"
        })
        
    # OpenAI
    if openai_key and (not provider_override or provider_override == "openai"):
        options.append({
            "provider": "openai",
            "model": model_override or "gpt-4o",
            "key": openai_key,
            "url": "https://api.openai.com/v1/chat/completions"
        })
        
    # Google Gemini (multiple models fallback)
    if gemini_key and (not provider_override or provider_override == "google"):
        models = [model_override] if model_override else ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
        for m in models:
            options.append({
                "provider": "google",
                "model": m,
                "key": gemini_key,
                "url": f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={gemini_key}"
            })
            
    if not options:
        log_error("No available API keys or no matching provider found. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.")
        sys.exit(1)
        
    response_text = None
    selected_model = None
    selected_provider = None
    input_tokens = 0
    output_tokens = 0
    latency_ms = 0
    
    # Try options sequentially until one succeeds
    for opt in options:
        provider = opt["provider"]
        model = opt["model"]
        key = opt["key"]
        url = opt["url"]
        
        log_info(f"Attempting escalation using {provider} model: {model}...")
        
        # Prepare request
        req_headers = {"Content-Type": "application/json"}
        req_data = {}
        
        if provider == "anthropic":
            req_headers["x-api-key"] = key
            req_headers["anthropic-version"] = "2023-06-01"
            req_data = {
                "model": model,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            }
        elif provider == "openai":
            req_headers["Authorization"] = f"Bearer {key}"
            req_data = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}]
            }
        elif provider == "google":
            req_data = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            
        # Send request
        start_time = time.time()
        try:
            req = urllib.request.Request(
                url, 
                data=json.dumps(req_data).encode("utf-8"), 
                headers=req_headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                latency_ms = int((time.time() - start_time) * 1000)
                body = res.read().decode("utf-8")
                res_json = json.loads(body)
                
                # Parse response based on provider
                if provider == "anthropic":
                    response_text = res_json["content"][0]["text"]
                    input_tokens = res_json["usage"]["input_tokens"]
                    output_tokens = res_json["usage"]["output_tokens"]
                elif provider == "openai":
                    response_text = res_json["choices"][0]["message"]["content"]
                    input_tokens = res_json["usage"]["prompt_tokens"]
                    output_tokens = res_json["usage"]["completion_tokens"]
                elif provider == "google":
                    response_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    input_tokens = res_json.get("usageMetadata", {}).get("promptTokenCount", len(prompt) // 4)
                    output_tokens = res_json.get("usageMetadata", {}).get("candidatesTokenCount", len(response_text) // 4)
                    
                selected_model = model
                selected_provider = provider
                log_info(f"Escalation successful (latency: {latency_ms}ms, tokens: {input_tokens} in / {output_tokens} out)")
                break  # Exit loop on success
                
        except urllib.error.HTTPError as e:
            latency_ms = int((time.time() - start_time) * 1000)
            err_msg = e.read().decode("utf-8") if e.fp else str(e)
            log_warn(f"Escalation via {provider} ({model}) failed with HTTP {e.code}: {e.reason}")
            try:
                err_json = json.loads(err_msg)
                sys.stderr.write(f"Details: {json.dumps(err_json, indent=2)}\n")
            except:
                sys.stderr.write(f"Details: {err_msg[:300]}\n")
            continue  # Try next model
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            log_warn(f"Escalation via {provider} ({model}) failed with error: {e}")
            continue  # Try next model
            
    if response_text is None:
        log_error("All escalation models failed.")
        sys.exit(1)
        
    # Output response
    print(response_text)
    
    # Log token usage via bookkeep.sh in background
    try:
        bookkeep_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "bookkeep.sh")
        if os.path.exists(bookkeep_path):
            import subprocess
            cmd = [
                "bash", bookkeep_path, "log-tokens", 
                selected_model, selected_provider, 
                str(input_tokens), str(output_tokens), 
                str(latency_ms), skill, mode
            ]
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        log_warn(f"Failed to trigger token bookkeeping: {e}")

if __name__ == "__main__":
    main()
EOF
