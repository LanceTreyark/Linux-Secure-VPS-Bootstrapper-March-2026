#!/bin/bash
#
# Base VPS configuration for Debian 13
#
# Purpose: This script will perform the following tasks:
# - Create Sudo User 
# - UFW Firewall
# - Set up SSH Keybased Access 
# - Remove Password Login 
# - InstallBTOP Server Monitor
# - Create Alias Commands (simple one word commands for common tasks)
#
# Setup Instructions:
#
# 1. SSH into your VPS as root using the IP address and root password provided by your hosting provider.
# - Example: ssh root@your_vps_ip
# 2. Run this one-liner to download and start the setup:
# COMMAND: apt update && apt install -y curl && curl -fsSL https://github.com/LanceTreyark/Linux-Initialization-Script---March-2026/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && bash /tmp/Linux-Initialization-Script---March-2026-main/start.sh
# Note: The script will prompt you for the new username and password for the sudo user,
# as well as your SSH public key for key-based authentication.
#
# Beginning script execution
#
# Check if the script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root."
  exit 1
fi  
# Check if there are existing users with sudo privileges
if getent group sudo | grep -q "\b$(whoami)\b"; then
  echo "A user with sudo privileges already exists. Please run this script on a fresh VPS without any existing sudo users."
  exit 1
fi
# Update package lists and upgrade existing packages
apt update && apt upgrade -y
# Install necessary packages
apt install -y sudo ufw btop curl ca-certificates gnupg
# Install Node.js via NodeSource (LTS)
echo "Installing Node.js LTS..."
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt update
apt install -y nodejs
echo "Node.js $(node -v) installed."
# Create a new sudo user
read -p "Enter the new username for the sudo user: " username
adduser $username
usermod -aG sudo $username
echo "User $username has been created and added to the sudo group."
# Set up UFW firewall rules (will enable at the end of the script)
ufw allow OpenSSH
echo "UFW rule added: OpenSSH allowed."
# Check for existing SSH keys — authorized_keys first (user SSH'd in with a key),
# then any .pub key files (ed25519, rsa, ecdsa, etc.)
existing_key_file=""
if [ -f ~/.ssh/authorized_keys ] && [ -s ~/.ssh/authorized_keys ]; then
  existing_key_file="$HOME/.ssh/authorized_keys"
  echo ""
  echo "Existing SSH key(s) found in root's authorized_keys:"
  echo "─────────────────────────────────────────"
  cat "$existing_key_file"
  echo "─────────────────────────────────────────"
  read -p "Copy these key(s) to the new user $username? (y/n) " use_existing_key
elif ls ~/.ssh/*.pub 1>/dev/null 2>&1; then
  existing_key_file=$(ls ~/.ssh/*.pub | head -n 1)
  echo ""
  echo "SSH public key found at $existing_key_file:"
  echo "─────────────────────────────────────────"
  cat "$existing_key_file"
  echo "─────────────────────────────────────────"
  read -p "Use this key for user $username? (y/n) " use_existing_key
fi
# Set up SSH key-based authentication
mkdir -p /home/$username/.ssh
if [ "$use_existing_key" == "y" ] && [ -n "$existing_key_file" ]; then
  cp "$existing_key_file" /home/$username/.ssh/authorized_keys
  echo "Existing SSH key(s) copied to user $username."
else
  read -p "Enter your SSH public key: " ssh_key
  echo "$ssh_key" > /home/$username/.ssh/authorized_keys
fi
chown -R $username:$username /home/$username/.ssh
chmod 700 /home/$username/.ssh
chmod 600 /home/$username/.ssh/authorized_keys
echo "SSH key-based authentication has been set up for user $username."
# Add additional SSH Keys if the user wants to add more keys
while true; do
  read -p "Do you want to add another SSH public key for user $username? (y/n) " add_more_keys
  if [ "$add_more_keys" == "y" ]; then
    read -p "Please enter the additional SSH public key: " additional_ssh_key
    echo $additional_ssh_key >> /home/$username/.ssh/authorized_keys
    chown $username:$username /home/$username/.ssh/authorized_keys
    chmod 600 /home/$username/.ssh/authorized_keys
    echo "Additional SSH key has been added for user $username."
  else
    break
  fi
done
# Disable password authentication for SSH
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd
echo "Password authentication for SSH has been disabled."
# Create alias commands for common tasks
echo "alias update='sudo apt update && sudo apt upgrade -y'" >> /home/$username/.bashrc
echo "alias bb='btop'" >> /home/$username/.bashrc
echo "alias monitor='btop'" >> /home/$username/.bashrc
echo "alias platforms='sudo bash /home/$username/PlatformTools/platformInstaller.sh'" >> /home/$username/.bashrc
echo "Alias commands have been added to the .bashrc file for user $username."
# Append alias commands to root's .bashrc so they are available for the root user as well
echo "alias update='sudo apt update && sudo apt upgrade -y'" >> /root/.bashrc
echo "alias bb='btop'" >> /root/.bashrc
echo "alias monitor='btop'" >> /root/.bashrc
echo "alias platforms='sudo bash /home/$username/PlatformTools/platformInstaller.sh'" >> /root/.bashrc
echo "Alias commands have been added to root's .bashrc."
# Copy PlatformTools to the sudo user's home directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/PlatformTools" ]; then
  cp -r "$SCRIPT_DIR/PlatformTools" /home/$username/PlatformTools
  chown -R $username:$username /home/$username/PlatformTools
  chmod +x /home/$username/PlatformTools/platformInstaller.sh
  echo "PlatformTools has been copied to /home/$username/PlatformTools"
else
  echo "WARNING: PlatformTools directory not found at $SCRIPT_DIR/PlatformTools"
  echo "The 'platforms' command will not work. Re-run using the one-liner from the README."
fi
# Copy over SSH keys to the root user's .ssh directory so that root can also use key-based authentication
mkdir -p /root/.ssh
cp /home/$username/.ssh/authorized_keys /root/.ssh/authorized_keys
chown root:root /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
echo "SSH keys have been copied to the root user's .ssh directory for key-based authentication."
# Open standard ports in UFW and enable
ufw allow 80/tcp
ufw allow 443/tcp
echo "Standard web ports 80 and 443 have been allowed through the UFW firewall."
ufw --force enable
echo "UFW firewall has been enabled with all rules."
# Detect server IP for the completion message
server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$server_ip" ]; then
  server_ip="your_vps_ip"
fi
# Return instructions for the user to log in with the new sudo user
echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "Log in with your new sudo user:"
echo "  ssh $username@$server_ip"
echo ""
echo "Available alias commands:"
echo "  update    - runs apt update && apt upgrade"
echo "  bb        - launches btop system monitor"
echo "  monitor   - launches btop system monitor"
echo "  platforms - opens the interactive package installer"
echo ""
