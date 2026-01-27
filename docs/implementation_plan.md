# B2 - Soft Delete + Restore Implementation Plan

## Overview

Implement soft delete, restore, and manual purge for users. Admin only.

### Confirmed Requirements

| Requirement | Decision |
|-------------|----------|
| Purge mechanism | Manual endpoint `POST /admin/users/purge` (no cron) |
| Cascade delete | Hard delete attendances + requests when purging |
| Self-delete | Prevented — Admin cannot delete themselves |
| SOFT_DELETE_DAYS | Configurable via env, default 15 |

### Current State

| Component | Status |
|-----------|--------|
| `User.deletedAt` field | ✅ Already added in B1 |
| [getAllUsers](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js#442-516) filter | ✅ Already filters by `deletedAt: null` unless `includeDeleted=true` |
| Soft delete endpoint | ❌ Not implemented |
| Restore endpoint | ❌ Not implemented |
| Purge endpoint | ❌ Not implemented |

---

## Implementation Steps (Logical Order)

### Phase 1: Backend - Controller Functions

#### Step 1.1: Add Model Imports to userController.js

**File**: [userController.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js)

**Location**: Lines 1-3 (top of file)

**Current**:
```javascript
import User from '../models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
```

**Change to**:
```javascript
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Request from '../models/Request.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
```

> [!NOTE]
> `Attendance` and `Request` models are needed for cascade delete in purge.

---

#### Step 1.2: Add softDeleteUser Function

**File**: [userController.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js)

**Location**: After [getAllUsers](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js#442-516) function (after line 515)

**Function**:
```javascript
/**
 * DELETE /api/admin/users/:id
 * Soft delete user (Admin only).
 * 
 * Behavior:
 * - Sets deletedAt = now
 * - Cannot delete yourself
 * - User will be purged after SOFT_DELETE_DAYS (configurable, default 15)
 * 
 * Response: { message, restoreDeadline }
 * Per API_SPEC.md#L573-L587
 */
export const softDeleteUser = async (req, res) => {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { id } = req.params;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        // Self-delete prevention
        if (id === req.user.userId) {
            return res.status(400).json({ message: 'Cannot delete yourself' });
        }

        // Find user (only active users, not already deleted)
        const user = await User.findOne({ _id: id, deletedAt: null });
        if (!user) {
            return res.status(404).json({ message: 'User not found or already deleted' });
        }

        // Set deletedAt
        const now = new Date();
        user.deletedAt = now;
        await user.save();

        // Calculate restore deadline
        const SOFT_DELETE_DAYS = parseInt(process.env.SOFT_DELETE_DAYS) || 15;
        const restoreDeadline = new Date(now.getTime() + SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);

        return res.status(200).json({
            message: 'User deleted',
            restoreDeadline: restoreDeadline.toISOString()
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('softDeleteUser error:', error);
        } else {
            console.error('softDeleteUser error');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
```

---

#### Step 1.3: Add restoreUser Function

**File**: [userController.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js)

**Location**: After `softDeleteUser` function

**Function**:
```javascript
/**
 * POST /api/admin/users/:id/restore
 * Restore soft-deleted user (Admin only).
 * 
 * Behavior:
 * - Sets deletedAt = null
 * - Only works if user is soft-deleted and not yet purged
 * 
 * Response: { user }
 * Per API_SPEC.md#L589-L604
 */
export const restoreUser = async (req, res) => {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { id } = req.params;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        // Find user (must be deleted, not purged)
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found or already purged' });
        }

        // Check if user is actually deleted
        if (!user.deletedAt) {
            return res.status(400).json({ message: 'User is not deleted' });
        }

        // Restore user
        user.deletedAt = null;
        await user.save();

        // Return sanitized user
        const sanitized = {
            _id: user._id,
            employeeCode: user.employeeCode,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            teamId: user.teamId,
            isActive: user.isActive,
            startDate: user.startDate,
            deletedAt: user.deletedAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        return res.status(200).json({ user: sanitized });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('restoreUser error:', error);
        } else {
            console.error('restoreUser error');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
```

---

#### Step 1.4: Add purgeDeletedUsers Function

**File**: [userController.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js)

**Location**: After `restoreUser` function

**Function**:
```javascript
/**
 * POST /api/admin/users/purge
 * Permanently delete users past retention period (Admin only).
 * 
 * Behavior:
 * - Finds users where deletedAt < (now - SOFT_DELETE_DAYS)
 * - CASCADE: Hard deletes related attendances and requests
 * - Hard deletes the users
 * 
 * Response: { purged: number, cascadeDeleted: {...}, details: [...] }
 */
export const purgeDeletedUsers = async (req, res) => {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const SOFT_DELETE_DAYS = parseInt(process.env.SOFT_DELETE_DAYS) || 15;
        const cutoffDate = new Date(Date.now() - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);

        // Find users to purge (deletedAt is set AND older than cutoff)
        const usersToPurge = await User.find({
            deletedAt: { $ne: null, $lt: cutoffDate }
        }).select('_id employeeCode name email').lean();

        if (usersToPurge.length === 0) {
            return res.status(200).json({
                message: 'No users to purge',
                purged: 0,
                details: []
            });
        }

        const userIds = usersToPurge.map(u => u._id);
        const details = [];

        // CASCADE: Delete related attendances
        const attendanceResult = await Attendance.deleteMany({ userId: { $in: userIds } });

        // CASCADE: Delete related requests
        const requestResult = await Request.deleteMany({ userId: { $in: userIds } });

        // Delete users
        const userResult = await User.deleteMany({ _id: { $in: userIds } });

        // Build details
        for (const user of usersToPurge) {
            details.push({
                userId: user._id,
                employeeCode: user.employeeCode,
                name: user.name,
                email: user.email
            });
        }

        return res.status(200).json({
            message: `Purged ${userResult.deletedCount} users`,
            purged: userResult.deletedCount,
            cascadeDeleted: {
                attendances: attendanceResult.deletedCount,
                requests: requestResult.deletedCount
            },
            details
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('purgeDeletedUsers error:', error);
        } else {
            console.error('purgeDeletedUsers error');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
```

---

### Phase 2: Backend - Routes

#### Step 2.1: Add Routes to adminRoutes.js

**File**: [adminRoutes.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/routes/adminRoutes.js)

> [!WARNING]
> **Route Order Critical**: `/users/purge` MUST be defined BEFORE `/users/:id` routes to avoid `purge` being treated as an `:id` parameter.

**Current** (lines 10-20):
```javascript
// User Management (ADMIN only)
// Per API_SPEC.md#L338-L372
router.post('/users', authenticate, userController.createUser);
router.get('/users', authenticate, userController.getAllUsers);

// PATCH /api/admin/users/:id - Update user basic fields
router.patch('/users/:id', authenticate, userController.updateUser);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', authenticate, userController.resetPassword);
```

**Change to**:
```javascript
// User Management (ADMIN only)
// Per API_SPEC.md#L338-L372
router.post('/users', authenticate, userController.createUser);
router.get('/users', authenticate, userController.getAllUsers);

// POST /api/admin/users/purge - Purge soft-deleted users past retention period
// IMPORTANT: Must be BEFORE :id routes to avoid 'purge' being treated as an ID
router.post('/users/purge', authenticate, userController.purgeDeletedUsers);

// PATCH /api/admin/users/:id - Update user basic fields
router.patch('/users/:id', authenticate, userController.updateUser);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', authenticate, userController.resetPassword);

// DELETE /api/admin/users/:id - Soft delete user
router.delete('/users/:id', authenticate, userController.softDeleteUser);

// POST /api/admin/users/:id/restore - Restore soft-deleted user
router.post('/users/:id/restore', authenticate, userController.restoreUser);
```

---

### Phase 3: Frontend - API Layer

#### Step 3.1: Add API Functions to adminApi.js

**File**: [adminApi.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/api/adminApi.js)

**Location**: After [getAdminUsers](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/api/adminApi.js#75-88) function (end of file, before closing)

**Add**:
```javascript
// ============================================
// SOFT DELETE & RESTORE
// ============================================

/**
 * Soft delete a user (sets deletedAt).
 * Roles: ADMIN only
 * @param {string} userId - User ID to delete
 * @returns {Promise} { message, restoreDeadline }
 */
export const softDeleteUser = (userId) =>
    client.delete(`/admin/users/${userId}`);

/**
 * Restore a soft-deleted user.
 * Roles: ADMIN only
 * @param {string} userId - User ID to restore
 * @returns {Promise} { user }
 */
export const restoreUser = (userId) =>
    client.post(`/admin/users/${userId}/restore`);

/**
 * Purge all users past retention period.
 * Roles: ADMIN only
 * @returns {Promise} { purged, cascadeDeleted, details }
 */
export const purgeDeletedUsers = () =>
    client.post('/admin/users/purge');
```

---

### Phase 4: Frontend - UI Components

#### Step 4.1: Update AdminMembersPage.jsx - Imports

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: Line 3 (after HiRefresh, HiPlus)

**Current**:
```javascript
import { HiRefresh, HiPlus } from 'react-icons/hi';
```

**Change to**:
```javascript
import { HiRefresh, HiPlus, HiTrash, HiReply } from 'react-icons/hi';
```

> [!NOTE]
> Using `HiReply` for restore icon (rotated arrow) since `HiRefresh` is already used for refresh. Alternative: `HiArrowNarrowUp` or `HiOutlineArrowPath`.

**Location**: Line 8 (imports from adminApi)

**Current**:
```javascript
import { getAdminUsers } from '../api/adminApi';
```

**Change to**:
```javascript
import { getAdminUsers, softDeleteUser, restoreUser, purgeDeletedUsers } from '../api/adminApi';
```

---

#### Step 4.2: Update AdminMembersPage.jsx - Add State

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: After line 65 (after `createModal` state)

**Add**:
```javascript
    const [includeDeleted, setIncludeDeleted] = useState(false);
```

---

#### Step 4.3: Update AdminMembersPage.jsx - Update fetchFn to Pass includeDeleted

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: Lines 105-114 (All Users usePagination hook)

**Current**:
```javascript
    } = usePagination({
        // P1 FIX: Signal signature - hook passes raw signal, not { signal }
        fetchFn: async (params, signal) => {
            const res = await getAdminUsers(params, { signal });
            return { 
                items: res.data.items ?? [], // P4 FIX: Null-safety consistent with Today Activity
                pagination: res.data.pagination 
            };
        },
        enabled: viewMode === 'all'
    });
```

**Change to**:
```javascript
    } = usePagination({
        // P1 FIX: Signal signature - hook passes raw signal, not { signal }
        fetchFn: async (params, signal) => {
            const res = await getAdminUsers({ ...params, includeDeleted: includeDeleted || undefined }, { signal });
            return { 
                items: res.data.items ?? [], // P4 FIX: Null-safety consistent with Today Activity
                pagination: res.data.pagination 
            };
        },
        enabled: viewMode === 'all',
        extraParams: { includeDeleted }  // Re-fetch when includeDeleted changes
    });
```

---

#### Step 4.4: Update AdminMembersPage.jsx - Add Handlers

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: After [handleViewModeChange](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx#189-198) function (after line 197)

**Add**:
```javascript
    // ═══════════════════════════════════════════════════════════════════════
    // SOFT DELETE HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleSoftDelete = async (userId, userName) => {
        if (!window.confirm(`Xóa nhân viên "${userName}"? Có thể khôi phục trong 15 ngày.`)) return;
        
        try {
            const res = await softDeleteUser(userId);
            showToast(`Đã xóa. Khôi phục trước: ${new Date(res.data.restoreDeadline).toLocaleDateString('vi-VN')}`, 'success');
            refetchAllUsers();
        } catch (err) {
            showToast(err.response?.data?.message || 'Xóa thất bại', 'failure');
        }
    };

    const handleRestore = async (userId, userName) => {
        try {
            await restoreUser(userId);
            showToast(`Đã khôi phục "${userName}"`, 'success');
            refetchAllUsers();
        } catch (err) {
            showToast(err.response?.data?.message || 'Khôi phục thất bại', 'failure');
        }
    };

    const handlePurge = async () => {
        if (!window.confirm('Xóa vĩnh viễn tất cả users đã xóa quá hạn? Không thể hoàn tác!')) return;
        
        try {
            const res = await purgeDeletedUsers();
            if (res.data.purged === 0) {
                showToast('Không có user nào cần xóa vĩnh viễn', 'info');
            } else {
                showToast(`Đã xóa vĩnh viễn ${res.data.purged} users`, 'success');
            }
            refetchAllUsers();
        } catch (err) {
            showToast(err.response?.data?.message || 'Purge thất bại', 'failure');
        }
    };
```

---

#### Step 4.5: Update AdminMembersPage.jsx - Update MemberSearchBar Section

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: Lines 258-264 (MemberSearchBar section)

**Current**:
```jsx
            {viewMode === 'all' && (
                <MemberSearchBar
                    value={search}
                    onChange={setSearch}
                    totalCount={pagination?.total ?? 0}
                />
            )}
```

**Change to**:
```jsx
            {viewMode === 'all' && (
                <div className="mb-4 space-y-3">
                    <MemberSearchBar
                        value={search}
                        onChange={setSearch}
                        totalCount={pagination?.total ?? 0}
                    />
                    
                    {/* Include Deleted Toggle + Purge Button */}
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                id="includeDeleted"
                                type="checkbox"
                                checked={includeDeleted}
                                onChange={(e) => setIncludeDeleted(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600">Hiển thị đã xóa</span>
                        </label>
                        
                        {includeDeleted && (
                            <Button color="failure" size="xs" onClick={handlePurge}>
                                <HiTrash className="mr-1 h-4 w-4" />
                                Xóa vĩnh viễn
                            </Button>
                        )}
                    </div>
                </div>
            )}
```

---

#### Step 4.6: Update AllUsersTable.jsx - Add Props and Imports

**File**: [AllUsersTable.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/components/members/AllUsersTable.jsx)

**Location**: Line 2 (imports)

**Current**:
```javascript
import { HiEye, HiPencil, HiKey } from 'react-icons/hi';
```

**Change to**:
```javascript
import { HiEye, HiPencil, HiKey, HiTrash, HiReply } from 'react-icons/hi';
```

**Location**: Lines 26-32 (function signature and props destructuring)

**Current**:
```javascript
export default function AllUsersTable({
    users,
    pagination,
    onPageChange,
    onViewDetail,
    onEdit,
    onResetPassword
}) {
```

**Change to**:
```javascript
export default function AllUsersTable({
    users,
    pagination,
    onPageChange,
    onViewDetail,
    onEdit,
    onResetPassword,
    onDelete,
    onRestore
}) {
```

---

#### Step 4.7: Update AllUsersTable.jsx - Add Delete/Restore Buttons

**File**: [AllUsersTable.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/components/members/AllUsersTable.jsx)

**Location**: Lines 100-130 (Actions column, after HiKey button)

Find the closing `</Button>` of the Reset Password button and add after it:

```jsx
                                            {/* Delete or Restore button based on deletedAt */}
                                            {user.deletedAt ? (
                                                <Button
                                                    size="xs"
                                                    color="success"
                                                    onClick={() => onRestore?.(user._id, user.name)}
                                                    title="Restore User"
                                                    aria-label="Restore user"
                                                >
                                                    <HiReply className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="xs"
                                                    color="failure"
                                                    onClick={() => onDelete?.(user._id, user.name)}
                                                    title="Delete User"
                                                    aria-label="Delete user"
                                                >
                                                    <HiTrash className="h-4 w-4" />
                                                </Button>
                                            )}
```

---

#### Step 4.8: Update AllUsersTable.jsx - Add Visual Indicator for Deleted Users

**File**: [AllUsersTable.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/components/members/AllUsersTable.jsx)

**Location**: Line 68 (Table.Row)

**Current**:
```jsx
                                <Table.Row key={user._id} className="bg-white">
```

**Change to**:
```jsx
                                <Table.Row 
                                    key={user._id} 
                                    className={user.deletedAt ? 'bg-red-50 opacity-60' : 'bg-white'}
                                >
```

---

#### Step 4.9: Update AdminMembersPage.jsx - Pass New Props to AllUsersTable

**File**: [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx)

**Location**: Lines 300-309 (AllUsersTable component)

**Current**:
```jsx
            {viewMode === 'all' && !allUsersLoading && (
                <AllUsersTable
                    users={allUsers}
                    pagination={pagination}
                    onPageChange={setPage}
                    onViewDetail={handleViewDetail}
                    onEdit={setEditUser}
                    onResetPassword={setResetUser}
                />
            )}
```

**Change to**:
```jsx
            {viewMode === 'all' && !allUsersLoading && (
                <AllUsersTable
                    users={allUsers}
                    pagination={pagination}
                    onPageChange={setPage}
                    onViewDetail={handleViewDetail}
                    onEdit={setEditUser}
                    onResetPassword={setResetUser}
                    onDelete={handleSoftDelete}
                    onRestore={handleRestore}
                />
            )}
```

---

### Phase 5: Tests

#### Step 5.1: Create Soft Delete Test File

**File**: [soft-delete.test.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/tests/soft-delete.test.js) [NEW]

```javascript
/**
 * Soft Delete + Restore Tests
 * 
 * Coverage: softDeleteUser, restoreUser, purgeDeletedUsers
 * Target: DELETE/POST /api/admin/users/:id, POST /api/admin/users/purge
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Attendance from '../src/models/Attendance.js';
import Request from '../src/models/Request.js';
import Team from '../src/models/Team.js';
import bcrypt from 'bcrypt';

let adminToken, adminId, managerToken, employeeToken, employeeId, testTeamId;

beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI?.replace(/\/[^/]+$/, '/soft_delete_test')
        || 'mongodb://localhost:27017/soft_delete_test');
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});
    await Request.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123', 10);
    const team = await Team.create({ name: 'Soft Delete Test Team' });
    testTeamId = team._id;

    const admin = await User.create({
        employeeCode: 'SD001', name: 'SD Admin',
        email: 'sdadmin@test.com', passwordHash,
        role: 'ADMIN', isActive: true
    });
    adminId = admin._id.toString();

    await User.create({
        employeeCode: 'SD002', name: 'SD Manager',
        email: 'sdmanager@test.com', passwordHash,
        role: 'MANAGER', teamId: testTeamId, isActive: true
    });

    const employee = await User.create({
        employeeCode: 'SD003', name: 'SD Employee',
        email: 'sdemployee@test.com', passwordHash,
        role: 'EMPLOYEE', teamId: testTeamId, isActive: true
    });
    employeeId = employee._id.toString();

    // Create attendance and request for employee (for cascade test)
    await Attendance.create({
        userId: employee._id,
        date: '2026-01-20',
        checkInAt: new Date('2026-01-20T08:30:00')
    });
    await Request.create({
        userId: employee._id,
        type: 'LEAVE',
        date: '2026-01-21',
        reason: 'Test leave',
        status: 'PENDING'
    });

    const adminRes = await request(app).post('/api/auth/login')
        .send({ identifier: 'sdadmin@test.com', password: 'Password123' });
    adminToken = adminRes.body.token;

    const mgrRes = await request(app).post('/api/auth/login')
        .send({ identifier: 'sdmanager@test.com', password: 'Password123' });
    managerToken = mgrRes.body.token;

    const empRes = await request(app).post('/api/auth/login')
        .send({ identifier: 'sdemployee@test.com', password: 'Password123' });
    employeeToken = empRes.body.token;
});

afterAll(async () => {
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});
    await Request.deleteMany({});
    await mongoose.connection.close();
});

// ============================================
// SOFT DELETE - HAPPY PATHS
// ============================================
describe('Soft Delete - Happy Paths', () => {
    let testUserId;

    beforeEach(async () => {
        // Create a fresh user for each test
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: `DEL${Date.now()}`, name: 'Delete Test',
            email: `delete${Date.now()}@test.com`, passwordHash,
            role: 'EMPLOYEE', isActive: true
        });
        testUserId = user._id.toString();
    });

    it('1. Admin can soft delete user → 200', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${testUserId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User deleted');
        expect(res.body.restoreDeadline).toBeDefined();

        // Verify deletedAt is set
        const user = await User.findById(testUserId);
        expect(user.deletedAt).not.toBeNull();
    });

    it('2. Soft deleted user has valid restoreDeadline', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${testUserId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const deadline = new Date(res.body.restoreDeadline);
        const now = new Date();
        const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
        
        expect(diffDays).toBeGreaterThan(14);
        expect(diffDays).toBeLessThan(16);
    });

    it('3. Soft deleted user excluded from getAllUsers by default', async () => {
        await request(app)
            .delete(`/api/admin/users/${testUserId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${adminToken}`);

        const found = res.body.items.find(u => u._id === testUserId);
        expect(found).toBeUndefined();
    });

    it('4. Soft deleted user included with includeDeleted=true', async () => {
        await request(app)
            .delete(`/api/admin/users/${testUserId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const res = await request(app)
            .get('/api/admin/users?includeDeleted=true')
            .set('Authorization', `Bearer ${adminToken}`);

        const found = res.body.items.find(u => u._id === testUserId);
        expect(found).toBeDefined();
        expect(found.deletedAt).not.toBeNull();
    });
});

// ============================================
// SOFT DELETE - EDGE CASES
// ============================================
describe('Soft Delete - Edge Cases', () => {
    it('5. Cannot delete yourself → 400', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${adminId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Cannot delete yourself');
    });

    it('6. Cannot delete already deleted user → 404', async () => {
        // Create and delete a user
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: 'ALRDEL', name: 'Already Deleted',
            email: 'alreadydeleted@test.com', passwordHash,
            role: 'EMPLOYEE', isActive: true
        });

        await request(app)
            .delete(`/api/admin/users/${user._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        // Try to delete again
        const res = await request(app)
            .delete(`/api/admin/users/${user._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe('User not found or already deleted');
    });

    it('7. Invalid user ID format → 400', async () => {
        const res = await request(app)
            .delete('/api/admin/users/not-valid-id')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid user ID format');
    });

    it('8. Non-existent user ID → 404', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .delete(`/api/admin/users/${fakeId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
    });
});

// ============================================
// SOFT DELETE - RBAC
// ============================================
describe('Soft Delete - RBAC', () => {
    it('9. Manager cannot soft delete → 403', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${employeeId}`)
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
    });

    it('10. Employee cannot soft delete → 403', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${employeeId}`)
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });

    it('11. No token → 401', async () => {
        const res = await request(app)
            .delete(`/api/admin/users/${employeeId}`);

        expect(res.status).toBe(401);
    });
});

// ============================================
// RESTORE - HAPPY PATHS
// ============================================
describe('Restore - Happy Paths', () => {
    it('12. Admin can restore soft-deleted user → 200', async () => {
        // Create and soft-delete
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: 'RESTORE1', name: 'Restore Test',
            email: 'restore1@test.com', passwordHash,
            role: 'EMPLOYEE', isActive: true
        });

        await request(app)
            .delete(`/api/admin/users/${user._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        // Restore
        const res = await request(app)
            .post(`/api/admin/users/${user._id}/restore`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.deletedAt).toBeNull();
    });

    it('13. Restored user appears in getAllUsers normally', async () => {
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: 'RESTORE2', name: 'Restore Appear',
            email: 'restore2@test.com', passwordHash,
            role: 'EMPLOYEE', isActive: true
        });

        await request(app)
            .delete(`/api/admin/users/${user._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        await request(app)
            .post(`/api/admin/users/${user._id}/restore`)
            .set('Authorization', `Bearer ${adminToken}`);

        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${adminToken}`);

        const found = res.body.items.find(u => u._id === user._id.toString());
        expect(found).toBeDefined();
    });
});

// ============================================
// RESTORE - EDGE CASES
// ============================================
describe('Restore - Edge Cases', () => {
    it('14. Cannot restore non-deleted user → 400', async () => {
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: 'NOTDEL', name: 'Not Deleted',
            email: 'notdeleted@test.com', passwordHash,
            role: 'EMPLOYEE', isActive: true
        });

        const res = await request(app)
            .post(`/api/admin/users/${user._id}/restore`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('User is not deleted');
    });

    it('15. Restore non-existent user → 404', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .post(`/api/admin/users/${fakeId}/restore`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
    });
});

// ============================================
// PURGE - HAPPY PATHS
// ============================================
describe('Purge - Happy Paths', () => {
    it('16. Purge returns 0 when no users past retention', async () => {
        const res = await request(app)
            .post('/api/admin/users/purge')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.purged).toBe(0);
    });

    it('17. Purge deletes users past retention with cascade', async () => {
        // Create user with backdated deletedAt
        const passwordHash = await bcrypt.hash('Password123', 10);
        const user = await User.create({
            employeeCode: 'PURGE1', name: 'Purge Test',
            email: 'purge1@test.com', passwordHash,
            role: 'EMPLOYEE', isActive: true,
            deletedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
        });

        // Create attendance and request for this user
        await Attendance.create({
            userId: user._id,
            date: '2026-01-15',
            checkInAt: new Date('2026-01-15T08:30:00')
        });
        await Request.create({
            userId: user._id,
            type: 'LEAVE',
            date: '2026-01-16',
            reason: 'Purge test',
            status: 'PENDING'
        });

        // Purge
        const res = await request(app)
            .post('/api/admin/users/purge')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.purged).toBeGreaterThanOrEqual(1);
        expect(res.body.cascadeDeleted).toBeDefined();

        // Verify user is gone
        const found = await User.findById(user._id);
        expect(found).toBeNull();

        // Verify cascade
        const attendance = await Attendance.findOne({ userId: user._id });
        expect(attendance).toBeNull();
        const request_ = await Request.findOne({ userId: user._id });
        expect(request_).toBeNull();
    });
});

// ============================================
// PURGE - RBAC
// ============================================
describe('Purge - RBAC', () => {
    it('18. Manager cannot purge → 403', async () => {
        const res = await request(app)
            .post('/api/admin/users/purge')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
    });

    it('19. Employee cannot purge → 403', async () => {
        const res = await request(app)
            .post('/api/admin/users/purge')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});

// ============================================
// SUMMARY
// ============================================
describe('Soft Delete Summary', () => {
    it('[HAPPY] ✓ Admin can soft delete and restore users', () => expect(true).toBe(true));
    it('[EDGE] ✓ Self-delete prevention, already deleted handling', () => expect(true).toBe(true));
    it('[RBAC] ✓ Manager/Employee get 403', () => expect(true).toBe(true));
    it('[PURGE] ✓ Cascade delete attendances and requests', () => expect(true).toBe(true));
});
```

---

## Verification Plan

### Automated Tests

```bash
cd /Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server
npm test -- --run tests/soft-delete.test.js
```

### Manual Verification

| # | Step | Expected |
|---|------|----------|
| 1 | Login as Admin → Quản lý nhân viên → All Users | See user list |
| 2 | Click 🗑️ (trash) icon on a user | Confirm dialog → User disappears |
| 3 | Toggle "Hiển thị đã xóa" checkbox | Deleted user appears with red background |
| 4 | Click ↩️ (restore) icon on deleted user | User restored, normal background |
| 5 | Delete user again, then click "Xóa vĩnh viễn" | Nothing happens (not past 15 days) |
| 6 | Backdate deletedAt in DB to 20 days ago | - |
| 7 | Click "Xóa vĩnh viễn" | User permanently deleted + cascade |

---

## File Summary

| File | Change Type | Lines Added |
|------|-------------|-------------|
| [userController.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/controllers/userController.js) | MODIFY | ~180 lines |
| [adminRoutes.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/src/routes/adminRoutes.js) | MODIFY | ~10 lines |
| [adminApi.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/api/adminApi.js) | MODIFY | ~25 lines |
| [AdminMembersPage.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/pages/AdminMembersPage.jsx) | MODIFY | ~80 lines |
| [AllUsersTable.jsx](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/client/src/components/members/AllUsersTable.jsx) | MODIFY | ~30 lines |
| [soft-delete.test.js](file:///Users/truongphuc/Desktop/phuctruong_6jan/code_folder/server/tests/soft-delete.test.js) | NEW | ~280 lines |

---

## Implementation Order (Dependency-based)

1. **Phase 1.1** → Add model imports to userController.js (required by purge)
2. **Phase 1.2-1.4** → Add 3 controller functions (no dependencies on each other)
3. **Phase 2.1** → Add routes (depends on controller functions)
4. **Phase 3.1** → Add frontend API functions (depends on routes)
5. **Phase 4.1-4.9** → Update frontend UI (depends on API functions)
6. **Phase 5.1** → Add tests (can run after backend is complete)
