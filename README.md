# Linux VPS Initialization Script

Base server configuration script for **Debian 13** that automates initial VPS setup.

## What This Script Does

- Creates a sudo user
- Configures UFW firewall (SSH, HTTP, HTTPS)
- Sets up SSH key-based authentication
- Disables password login
- Installs btop system monitor
- Adds alias commands for common tasks

## Installation

### 1. SSH into your VPS as root

```bash
ssh root@your_vps_ip
```

### 2. Install curl (if not already installed)

```bash
apt install -y curl
```

### 3. Download the script

```bash
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/Linux_Initialization_Script_March_2026/main/start.sh
```

Or create it manually:

```bash
nano start.sh
```

Paste the script contents, then save with `Ctrl + O`, `Enter`, `Ctrl + X`.

### 4. Make the script executable

```bash
chmod +x start.sh
```

### 5. Run the script

```bash
sudo ./start.sh
```

### 6. Follow the prompts

The script will ask you to:

1. Enter a username for the new sudo user
2. Set a password for the new user
3. Provide your SSH public key (or use an existing one)
4. Optionally add additional SSH keys

## After Installation

Log in with your new sudo user:

```bash
ssh your_username@your_vps_ip
```

### Available Alias Commands

| Command   | Action                              |
|-----------|-------------------------------------|
| `update`  | `sudo apt update && sudo apt upgrade -y` |
| `bb`      | Launches `btop` system monitor      |
| `monitor` | Launches `btop` system monitor      |

## Firewall Ports

The following ports are opened by default:

| Port    | Service |
|---------|---------|
| 22/tcp  | SSH     |
| 80/tcp  | HTTP    |
| 443/tcp | HTTPS   |
