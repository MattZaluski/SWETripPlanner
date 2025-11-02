# SWETripPlanner
New Repo for Trip Planner
Quick one-page setup (exact commands)

1) Clone repo & enter folder
```bash
git clone https://github.com/<ORG>/trip-planner.git
cd trip-planner
```

2) Create a branch (optional but recommended)
```bash
git checkout -b feature/setup
```

3) Create virtual environment

**Windows PowerShell**
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run once:
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1
```

**Windows cmd.exe**
```bash
python -m venv venv
venv\Scripts\activate
```

**mac / Linux (bash)**
```bash
python3 -m venv venv
source venv/bin/activate
```

4) Install dependencies
```bash
pip install --upgrade pip
pip install -r backend/requirements.txt
```

5) Copy env example and enable mock

**mac / linux**
```bash
cp backend/.env.example backend/.env
```

**Windows PowerShell**
```bash
Copy-Item backend\.env.example backend\.env
```

Open `backend/.env` and set:
```bash
MOCK=true
```

6) Select venv interpreter in VS Code  
Press `Ctrl/Cmd + Shift + P → Python: Select Interpreter →` choose the venv interpreter from this repo.

7) Start the dev server
```bash
python backend/app.py
```

or
```bash
python -m flask --app backend/app.py --debug run
```


8) Open the app  
In browser: `http://127.0.0.1:5000`