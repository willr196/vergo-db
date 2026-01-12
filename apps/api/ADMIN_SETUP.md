# Admin User Setup Guide

This guide explains how to create an admin user for the VERGO Events system.

## Quick Setup

### Option 1: Using the Setup Script (Recommended)

**Linux/Mac:**
```bash
cd apps/api
./create-admin.sh
```

**Windows:**
```cmd
cd apps\api
create-admin.bat
```

The script will prompt you for:
- Admin username (default: `admin`)
- Admin password (minimum 8 characters)

### Option 2: Manual Setup

If you prefer to set up manually:

1. Set environment variables:
   ```bash
   export ADMIN_USERNAME="admin"        # Optional, defaults to 'admin'
   export ADMIN_PASSWORD="your_password"  # Required
   ```

2. Run the seed script:
   ```bash
   npm run seed
   ```

### Option 3: Using .env File

1. Create a `.env` file in `apps/api/`:
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   ```

2. Run the seed script:
   ```bash
   npm run seed
   ```

## Password Requirements

- Minimum 8 characters
- Should include a mix of uppercase, lowercase, numbers, and symbols
- Examples: `SecurePass123!`, `Admin@2024`

## Logging In

Once the admin user is created:

1. Start the application
2. Navigate to: `http://localhost:3000/login.html`
3. Enter your credentials:
   - **Username**: `admin` (or the username you set)
   - **Password**: The password you created

## Troubleshooting

### "Invalid credentials" error

**Possible causes:**
1. Admin user hasn't been created yet
   - **Solution**: Run the setup script or seed command

2. Wrong password
   - **Solution**: Re-run the seed script with the correct password to reset it

3. Account is locked (too many failed attempts)
   - **Solution**: Wait 30 minutes, or reset via database

### Resetting the Admin Password

To reset your admin password, simply re-run the seed script with a new password:

```bash
ADMIN_PASSWORD=NewPassword123! npm run seed
```

This will update the existing admin user with the new password.

## Security Notes

- Never commit `.env` files containing passwords to version control
- Use strong, unique passwords for production
- Change default passwords immediately in production environments
- Store credentials securely (password manager, secure vault, etc.)

## Additional Help

If you continue to have issues:
1. Check that the database is running and accessible
2. Verify Prisma migrations are up to date: `npx prisma migrate deploy`
3. Check application logs for error messages
