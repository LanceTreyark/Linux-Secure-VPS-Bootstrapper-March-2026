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
# - Enter the root password when prompted.
# 2. Create a new file named start.sh and copy the contents of this script into it.
# COMMAND: nano start.sh
# Copy & Paste this script content and save the file using (Ctrl + O, then Enter, and Ctrl + X to exit).
# 3. Make the script executable by running the following command:
# COMMAND: sudo chmod +x start.sh
# 4. Run the script with root privileges:
# COMMAND: sudo ./start.sh
# Note: The script will prompt you for the new username and password for the sudo user, as well as your SSH public key for key-based authentication. Follow the prompts to complete the setup.
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
apt install -y sudo ufw btop curl
# Create a new sudo user
read -p "Enter the new username for the sudo user: " username
adduser $username
usermod -aG sudo $username
echo "User $username has been created and added to the sudo group."
# Set up UFW firewall rules (will enable at the end of the script)
ufw allow OpenSSH
echo "UFW rule added: OpenSSH allowed."
# Check if there are any existing ssh keys in the default location and prompt the user to use one if available
if [ -f ~/.ssh/id_rsa.pub ]; then
  read -p "An SSH public key was found at ~/.ssh/id_rsa.pub. Do you want to use this key for SSH access? (y/n) " use_existing_key
fi  
# if the keys exist and the user wants to use them, read the key from the file and store it in a variable
if [ "$use_existing_key" == "y" ]; then
  ssh_key=$(cat ~/.ssh/id_rsa.pub)
else
# If keys already exist copy the existing keys to the new sudo user's .ssh directory so that they can be used for SSH access
  read -p "No existing SSH public key will be used. Please enter your SSH public key (e.g., from ~/.ssh/id_rsa.pub): " ssh_key
fi
# Set up SSH key-based authentication
mkdir -p /home/$username/.ssh
echo $ssh_key > /home/$username/.ssh/authorized_keys
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
echo "Alias commands have been added to the .bashrc file for user $username."
# Append alias commands to root's .bashrc so they are available for the root user as well
echo "alias update='sudo apt update && sudo apt upgrade -y'" >> /root/.bashrc
echo "alias bb='btop'" >> /root/.bashrc
echo "alias monitor='btop'" >> /root/.bashrc
echo "Alias commands have been added to root's .bashrc."
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
# Return instructions for the user to log in with the new sudo user
echo ""
echo "===== Setup Complete! ====="
echo "You can now log in to your VPS using the new sudo user $username with SSH key-based authentication."
echo "  ssh $username@your_vps_ip"
echo ""
echo "Available alias commands:"
echo "  update  - runs apt update && apt upgrade"
echo "  bb      - launches btop system monitor"
echo "  monitor - launches btop system monitor"
