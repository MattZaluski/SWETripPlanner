# SWETripPlanner
New Repo for Trip Planner
Quick one-page setup (exact commands)
1) Clone repo & enter folder
git clone https://github.com/<ORG>/trip-planner.git
cd trip-planner

2) Create a branch (optional but recommended)
git checkout -b feature/setup

3) Create virtual environment

Windows PowerShell

python -m venv venv
.\venv\Scripts\Activate.ps1


If PowerShell blocks activation, run once:

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1


Windows cmd.exe

python -m venv venv
venv\Scripts\activate


mac / Linux (bash)

python3 -m venv venv
source venv/bin/activate

4) Install dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

5) Copy env example and enable mock

mac / linux

cp backend/.env.example backend/.env


Windows PowerShell

Copy-Item backend\.env.example backend\.env


Open backend/.env and set:

MOCK=true

6) Select venv interpreter in VS Code

Ctrl/Cmd+Shift+P → Python: Select Interpreter → choose the venv interpreter from this repo.

7) Start the dev server
python backend/app.py

8) Open the app

In browser: http://127.0.0.1:5000
