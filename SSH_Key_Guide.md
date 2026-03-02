# SSH Key Guide

How to generate SSH keys on your local machine so you can securely connect to your VPS (and GitHub).

---

## What Is an SSH Key?

An SSH key is a pair of files:

- **Private key** (`id_ed25519`) — stays on your computer. Never share this.
- **Public key** (`id_ed25519.pub`) — you copy this to servers you want to access.

When you connect, your machine proves it holds the private key without ever sending it over the network.

---

## Generate Your SSH Key

### Linux

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

- Press **Enter** to accept the default path (`~/.ssh/id_ed25519`)
- Enter a passphrase (recommended) or press **Enter** for none

Your keys are now at:

```
~/.ssh/id_ed25519       (private)
~/.ssh/id_ed25519.pub   (public)
```

Copy your public key to clipboard:

```bash
cat ~/.ssh/id_ed25519.pub
```

Select and copy the output.

---

### macOS

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

- Press **Enter** to accept the default path (`~/.ssh/id_ed25519`)
- Enter a passphrase (recommended) or press **Enter** for none

Copy your public key to clipboard:

```bash
pbcopy < ~/.ssh/id_ed25519.pub
```

#### Add your key to the macOS Keychain (optional)

So you don't have to type your passphrase every time:

```bash
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

Add this to `~/.ssh/config` so it persists across reboots:

```
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
```

---

### Windows

#### Option A: PowerShell (Windows 10/11)

OpenSSH is built into Windows 10 (1809+) and Windows 11.

```powershell
ssh-keygen -t ed25519 -C "your_email@example.com"
```

- Press **Enter** to accept the default path (`C:\Users\YourName\.ssh\id_ed25519`)
- Enter a passphrase (recommended) or press **Enter** for none

Copy your public key to clipboard:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
```

#### Option B: WSL (Windows Subsystem for Linux)

If you use WSL, follow the **Linux** instructions above inside your WSL terminal. Your keys will be at:

```
/home/your_username/.ssh/id_ed25519.pub
```

#### Option C: Git Bash

If you have Git for Windows installed, open **Git Bash** and follow the **Linux** instructions. Keys will be at:

```
C:\Users\YourName\.ssh\id_ed25519.pub
```

---

## Add Your Key to the VPS

### During setup (recommended)

When you run `start.sh`, you'll be prompted to paste your public key. Just paste the contents of `id_ed25519.pub`.

### Manually (after setup)

```bash
ssh root@your_vps_ip "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
```

Then append your key:

```bash
cat ~/.ssh/id_ed25519.pub | ssh root@your_vps_ip "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Or use the built-in shortcut (if available):

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your_vps_ip
```

---

## Add Your Key to GitHub

1. Go to [github.com/settings/keys](https://github.com/settings/keys)
2. Click **New SSH key**
3. Title: give it a name (e.g., "My Laptop" or "VPS Server")
4. Paste your public key into the **Key** field
5. Click **Add SSH key**

Test the connection:

```bash
ssh -T git@github.com
```

You should see:

```
Hi YourUsername! You've successfully authenticated, but GitHub does not provide shell access.
```

---

## Already Have a Key?

Check if you already have SSH keys:

```bash
ls -la ~/.ssh/
```

Look for files named `id_ed25519`, `id_rsa`, `id_ecdsa`, or their `.pub` counterparts. If they exist, you can use them — no need to generate new ones.

View your existing public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

---

## Troubleshooting

### "Permission denied (publickey)"

- Make sure your key is added: `ssh-add ~/.ssh/id_ed25519`
- Verify the public key is in the server's `~/.ssh/authorized_keys`
- Check permissions: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`

### "Agent refused operation" or key not found

Start the SSH agent:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

On Windows PowerShell:

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

### Wrong key being used

Force a specific key:

```bash
ssh -i ~/.ssh/id_ed25519 user@your_vps_ip
```

### Ed25519 not supported (old systems)

Use RSA instead:

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

---

## Quick Reference

| OS      | Generate Key                                          | Copy Public Key                                        |
|---------|-------------------------------------------------------|--------------------------------------------------------|
| Linux   | `ssh-keygen -t ed25519 -C "email"`                    | `cat ~/.ssh/id_ed25519.pub`                            |
| macOS   | `ssh-keygen -t ed25519 -C "email"`                    | `pbcopy < ~/.ssh/id_ed25519.pub`                       |
| Windows | `ssh-keygen -t ed25519 -C "email"` (PowerShell)       | `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub \| Set-Clipboard` |
| WSL     | `ssh-keygen -t ed25519 -C "email"`                    | `cat ~/.ssh/id_ed25519.pub`                            |
