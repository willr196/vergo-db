@echo off
REM VERGO - Create Admin User Script (Windows)
REM This script helps you create an admin user for the VERGO system

echo.
echo VERGO - Admin User Setup
echo ====================================
echo.

REM Check if ADMIN_PASSWORD is already set
if defined ADMIN_PASSWORD (
    echo Admin password is already set in environment
    if not defined ADMIN_USERNAME set ADMIN_USERNAME=admin
    echo Username: %ADMIN_USERNAME%
    echo.
    echo Running seed script...
    call npm run seed
    exit /b
)

REM Prompt for username
set /p USERNAME="Enter admin username (default: admin): "
if "%USERNAME%"=="" set USERNAME=admin

REM Prompt for password
echo.
echo Enter a secure password (minimum 8 characters):
set "PASSWORD="
set "psCommand=powershell -Command "$password = Read-Host -AsSecureString; $BSTR=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password); [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)""
for /f "usebackq delims=" %%p in (`%psCommand%`) do set PASSWORD=%%p

echo.
echo Confirm password:
set "PASSWORD_CONFIRM="
for /f "usebackq delims=" %%p in (`%psCommand%`) do set PASSWORD_CONFIRM=%%p

REM Validate passwords match
if not "%PASSWORD%"=="%PASSWORD_CONFIRM%" (
    echo.
    echo Error: Passwords do not match!
    exit /b 1
)

REM Run the seed script
echo.
echo Creating admin user...
set ADMIN_USERNAME=%USERNAME%
set ADMIN_PASSWORD=%PASSWORD%
call npm run seed

if errorlevel 1 (
    echo.
    echo Failed to create admin user. Please check the error messages above.
    exit /b 1
)

echo.
echo Success! Your admin user has been created.
echo.
echo Login Credentials:
echo    URL: http://localhost:3000/login.html
echo    Username: %USERNAME%
echo    Password: (the one you just entered)
echo.
echo Tip: Save these credentials securely!
echo.
