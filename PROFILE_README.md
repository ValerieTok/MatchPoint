# Profile Page Implementation

## Overview
A complete user profile page has been implemented for the MatchPoint application, featuring profile management, password reset, and past sessions display.

## Features Implemented

### 1. Profile Management
- **Personal Information**: Edit username (split into first/last name), email, phone number
- **Bio Section**: Add/edit a personal bio
- **Photo Upload**: Upload profile photo (JPG, PNG, GIF, WebP - max 2MB)
- **Real-time Preview**: See photo preview before uploading

### 2. Password Reset
- Change password securely with current password verification
- Minimum 8 character requirement
- Password confirmation validation

### 3. Past Sessions
- View up to 5 most recent booking sessions
- Session details include sport/title, date, and time
- Direct link to write reviews for completed sessions

## Files Created/Modified

### New Files
1. **views/profile.ejs** - Profile page template
2. **public/css/user-profile.css** - Profile-specific styling
3. **migrations/add_profile_fields.sql** - Database migration for bio and photo fields

### Modified Files
1. **app.js** - Added profile routes (GET /profile, POST /profile, POST /profile/reset-password)
2. **controllers/AccountController.js** - Added showProfile, updateProfile, and resetPassword methods
3. **models/Account.js** - Added updateUserProfile method and updated getUserById to include bio/photo
4. **views/partials/userSidebar.ejs** - Already includes Profile navigation link

## Database Migration

Before using the profile page, run the database migration to add the required columns:

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS photo VARCHAR(255);
```

Or execute the migration file:
```bash
mysql -u your_username -p your_database < migrations/add_profile_fields.sql
```

## Routes

- **GET /profile** - Display user profile page
- **POST /profile** - Update profile information (including photo upload)
- **POST /profile/reset-password** - Reset user password

## Usage

1. Run the database migration to add bio and photo fields
2. Navigate to `/profile` when logged in
3. Update profile information and click "Save Changes"
4. Reset password using the sidebar form
5. View and review past sessions from the Past Sessions section

## Design
The profile page follows the existing MatchPoint design system:
- Consistent sidebar navigation
- Red accent color (#ef4444)
- Responsive layout (mobile-friendly)
- Flash message support for success/error notifications

## Security
- Authentication required for all profile routes
- Password verification for password changes
- File upload validation (type and size)
- Secure file storage in /public/images/
- Session-based user identification
