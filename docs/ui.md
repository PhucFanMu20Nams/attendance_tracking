
---

## 📋 IMPLEMENTATION PLAN

### 🎯 FEATURE 1: Admin Holidays Management UI

#### 1.1 Files cần tạo/sửa

| File | Action | Mô tả |
|------|--------|-------|
| client/src/api/adminApi.js | **CREATE** | API layer cho admin endpoints (holidays + create user) |
| client/src/pages/AdminHolidaysPage.jsx | **CREATE** | Trang quản lý holidays |
| client/src/App.jsx | **EDIT** | Thêm route `/admin/holidays` |
| client/src/components/Layout.jsx | **EDIT** | Thêm nav item "Holidays" cho ADMIN |

#### 1.2 API Layer: `adminApi.js`

```
Location: client/src/api/adminApi.js
Pattern: Copy từ memberApi.js
```

**Functions cần implement:**
```javascript
// GET /admin/holidays?year=YYYY
export const getHolidays = (year) => client.get('/admin/holidays', { params: { year } });

// POST /admin/holidays
export const createHoliday = (data) => client.post('/admin/holidays', data);

// POST /admin/users (Create user)
export const createUser = (data) => client.post('/admin/users', data);
```

#### 1.3 Page: `AdminHolidaysPage.jsx`

**Pattern theo:** AdminMembersPage.jsx

**Components sử dụng (từ flowbite-react):**
- `Table` - Danh sách holidays
- `Button` - "Add Holiday" button
- `Modal` - Create holiday form modal
- `TextInput` - Date input, Name input
- `Label` - Form labels
- `Alert` - Error/Success messages
- `Spinner` - Loading state
- `Select` - Year filter
- `Toast` - Success notification

**UI Layout:**
```
┌─────────────────────────────────────────────────────┐
│ PageHeader: "Quản lý ngày nghỉ"                     │
│   [Year Selector: 2026 ▼]  [+ Thêm ngày nghỉ]       │
├─────────────────────────────────────────────────────┤
│ Table:                                               │
│   | Ngày       | Tên              | Actions         │
│   | 01/01/2026 | Tết Dương lịch   | [Delete]        │
│   | 30/04/2026 | Ngày giải phóng  | [Delete]        │
│   | ...                                              │
└─────────────────────────────────────────────────────┘

Modal (Create Holiday):
┌─────────────────────────────────────────────────────┐
│ Thêm ngày nghỉ                               [X]    │
├─────────────────────────────────────────────────────┤
│ Ngày *      [____date picker____]                   │
│ Tên *       [____________________]                   │
├─────────────────────────────────────────────────────┤
│                    [Hủy]  [Lưu]                     │
└─────────────────────────────────────────────────────┘
```

**State management:**
```javascript
// Data states
const [holidays, setHolidays] = useState([]);
const [selectedYear, setSelectedYear] = useState(getCurrentYear());
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

// Modal states
const [createModal, setCreateModal] = useState(false);
const [formData, setFormData] = useState({ date: '', name: '' });
const [formLoading, setFormLoading] = useState(false);
const [formError, setFormError] = useState('');

// Toast
const [toast, setToast] = useState({ show: false, message: '' });
```

**Features:**
1. ✅ Load holidays theo năm (default: năm hiện tại GMT+7)
2. ✅ Year selector (last 3 years + next 2 years)
3. ✅ Create holiday via modal
4. ✅ Form validation (date required, name required)
5. ✅ Handle duplicate date error (409)
6. ✅ Success toast after create
7. ⏳ Delete holiday (optional - API chưa có, có thể bỏ qua MVP)

#### 1.4 Route + Navigation

**App.jsx - Thêm route:**
```jsx
import AdminHolidaysPage from './pages/AdminHolidaysPage';

// Trong Routes, sau /admin/members/:id
<Route
    path="/admin/holidays"
    element={
        <RoleRoute allowedRoles={['ADMIN']}>
            <AdminHolidaysPage />
        </RoleRoute>
    }
/>
```

**Layout.jsx - Thêm nav item:**
```javascript
// Thêm vào navItems array sau admin/members
{ to: '/admin/holidays', label: 'Holidays', icon: HiCalendar, roles: ['ADMIN'] },
```

---

### 🎯 FEATURE 2: Admin Create User UI

#### 2.1 Files cần tạo/sửa

| File | Action | Mô tả |
|------|--------|-------|
| client/src/api/adminApi.js | **EDIT** | Đã tạo ở Feature 1, thêm `createUser` |
| client/src/pages/AdminMembersPage.jsx | **EDIT** | Thêm "Create User" button + modal |

#### 2.2 Thêm vào AdminMembersPage.jsx

**Pattern theo:** Edit modal đã có trong file

**Thêm Components:**
- Reuse Modal pattern từ editModal
- Form fields theo API spec:
  - `employeeCode` (required) - TextInput
  - `name` (required) - TextInput
  - `email` (required) - TextInput
  - `username` (optional) - TextInput
  - `password` (required, min 8) - TextInput type="password"
  - `role` (required) - Select: ADMIN | MANAGER | EMPLOYEE
  - `teamId` (optional) - Select teams
  - `startDate` (optional) - TextInput type="date"
  - `isActive` (optional, default true) - Select: true/false

**UI Layout trong PageHeader:**
```jsx
<PageHeader title="Quản lý nhân viên">
    <Button color="success" onClick={() => setCreateModal(true)}>
        <HiPlus className="mr-2 h-4 w-4" />
        Thêm nhân viên
    </Button>
    <Button color="light" onClick={() => fetchMembers()}>
        <HiRefresh className="mr-2 h-4 w-4" />
        Làm mới
    </Button>
</PageHeader>
```

**Create User Modal:**
```
┌─────────────────────────────────────────────────────────┐
│ Thêm nhân viên mới                               [X]    │
├─────────────────────────────────────────────────────────┤
│ Mã NV *        [__________]   Role *  [EMPLOYEE ▼]     │
│ Họ tên *       [____________________________]          │
│ Email *        [____________________________]          │
│ Username       [____________________________]          │
│ Mật khẩu *     [____________________________]          │
│ Team           [Select team... ▼]                      │
│ Ngày bắt đầu   [____date____]                          │
│ Trạng thái     [Active ▼]                              │
│                                                         │
│ [Alert: Error message if any]                          │
├─────────────────────────────────────────────────────────┤
│                         [Hủy]  [Tạo nhân viên]         │
└─────────────────────────────────────────────────────────┘
```

**Thêm States:**
```javascript
// Create user modal states
const [createModal, setCreateModal] = useState(false);
const [createForm, setCreateForm] = useState({
    employeeCode: '',
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'EMPLOYEE',
    teamId: '',
    startDate: '',
    isActive: true
});
const [createLoading, setCreateLoading] = useState(false);
const [createError, setCreateError] = useState('');
```

**Form validation (client-side):**
```javascript
const validateCreateForm = () => {
    if (!createForm.employeeCode.trim()) return 'Employee code is required';
    if (!createForm.name.trim()) return 'Name is required';
    if (!createForm.email.trim()) return 'Email is required';
    if (!createForm.password) return 'Password is required';
    if (createForm.password.length < 8) return 'Password must be at least 8 characters';
    if (!createForm.role) return 'Role is required';
    return null; // Valid
};
```

**Submit handler:**
```javascript
const handleCreateSubmit = async () => {
    const validationError = validateCreateForm();
    if (validationError) {
        setCreateError(validationError);
        return;
    }
    
    setCreateLoading(true);
    setCreateError('');
    try {
        const payload = {
            employeeCode: createForm.employeeCode.trim(),
            name: createForm.name.trim(),
            email: createForm.email.trim(),
            password: createForm.password,
            role: createForm.role,
        };
        
        // Optional fields
        if (createForm.username.trim()) payload.username = createForm.username.trim();
        if (createForm.teamId) payload.teamId = createForm.teamId;
        if (createForm.startDate) payload.startDate = createForm.startDate;
        if (createForm.isActive !== undefined) payload.isActive = createForm.isActive;
        
        await createUser(payload);
        setCreateModal(false);
        resetCreateForm();
        showToast('Tạo nhân viên thành công!');
        fetchMembers(); // Refresh list
    } catch (err) {
        setCreateError(err.response?.data?.message || 'Tạo nhân viên thất bại');
    } finally {
        setCreateLoading(false);
    }
};
```

---

## 📁 FILE CHANGES SUMMARY

### New Files (2 files)
1. `client/src/api/adminApi.js` - Admin API layer
2. `client/src/pages/AdminHolidaysPage.jsx` - Holidays management page

### Modified Files (3 files)
1. App.jsx - Add route for `/admin/holidays`
2. Layout.jsx - Add nav item "Holidays"
3. AdminMembersPage.jsx - Add "Create User" button + modal

---

## 🔄 IMPLEMENTATION ORDER

```
Step 1: Tạo adminApi.js (API layer)
        └─ getHolidays(), createHoliday(), createUser()

Step 2: Tạo AdminHolidaysPage.jsx
        └─ List holidays + Create modal

Step 3: Sửa App.jsx
        └─ Add route /admin/holidays

Step 4: Sửa Layout.jsx
        └─ Add "Holidays" nav item

Step 5: Sửa AdminMembersPage.jsx
        └─ Add "Create User" button + modal + handler

Step 6: Test manual
        └─ Login as Admin → Create holiday → Create user
```

---

## ✅ CHECKLIST TRƯỚC KHI CODE

- [ ] Pattern nhất quán với các page hiện có (AdminMembersPage)
- [ ] Sử dụng `PageHeader` component
- [ ] Sử dụng `StatusBadge` nếu cần
- [ ] Sử dụng flowbite-react components only
- [ ] Error handling với Alert
- [ ] Loading states với Spinner
- [ ] Success feedback với Toast
- [ ] Form validation client-side trước khi submit
- [ ] AbortController cho fetch calls (cleanup on unmount)
- [ ] RBAC route protection với RoleRoute

---

Bạn muốn tôi bắt đầu implement theo plan này không? Tôi sẽ làm từng step một.