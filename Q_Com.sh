#!/bin/bash

# What is this?
# This is a helper script I made in order to quickly commit and push all changes to GitHub with a timestamp message.
# Usage:

# make the script executable:
#sudo chmod +x Q_Com.sh

# This is designed to run on linux using an alias command in ~/.bash_aliases like so:
# alias commit='./Q_Com.sh && git push -u origin main'
# Then you can just type 'commit' in the terminal to run it while you are in your project directory.


git add *
date_time="$(date +"%m.%d.%y %I:%M%p")"
# If you want to add a commit message along with the timestamp, uncomment below:
#read -p "Enter an additional commit message (optional)   " var_commit
echo "*"
# Uncomment below to add additional commit message
#git commit -m "$date_time $var_commit"
git commit -m "$date_time"
echo "*  *"
echo "*  *  *"
sleep 1
echo "Script v.020523 Complete"

# Example of old style usage:
#sudo git add *
#sudo git commit -m "12:24pm 11.29.25"
#sudo git push -u origin main


#v.12.03.25