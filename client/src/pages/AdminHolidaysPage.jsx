import { useState, useEffect, useCallback } from 'react';
import {
    Table, Button, Modal, Spinner, Alert, Select, Label, TextInput, Toast
} from 'flowbite-react';
import { HiPlus, HiCheck, HiX } from 'react-icons/hi';
import { getHolidays, createHoliday } from '../api/adminApi';
import { PageHeader } from '../components/ui';

/**
 * AdminHolidaysPage: Admin manages company holidays.
 * 
 * Features:
 * - List holidays by year (default: current year GMT+7)
 * - Year selector (last 3 years + next 2 years)
 * - Create holiday via modal
 * - Form validation (date required, name required)
 * - Handle duplicate date error (409)
 * 
 * RBAC: ADMIN only (enforced by route + backend)
 */
export default function AdminHolidaysPage() {
    // Get current year in GMT+7
    const getCurrentYear = () => {
        const now = new Date();
        return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
            .getFullYear()
            .toString();
    };

    // Data states
    const [holidays, setHolidays] = useState([]);
    const [selectedYear, setSelectedYear] = useState(() => getCurrentYear());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states
    const [createModal, setCreateModal] = useState(false);
    const [formData, setFormData] = useState({ date: '', name: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

    // Toast state
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // Generate year options (last 3 years + next 2 years)
    const yearOptions = (() => {
        const currentYear = parseInt(getCurrentYear(), 10);
        const years = [];
        for (let y = currentYear - 3; y <= currentYear + 2; y++) {
            years.push(y.toString());
        }
        return years;
    })();

    // Fetch holidays when year changes
    const fetchHolidays = useCallback(async (signal) => {
        setLoading(true);
        setError('');
        try {
            const res = await getHolidays(selectedYear, signal ? { signal } : undefined);
            setHolidays(res.data.items || []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load holidays');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        const controller = new AbortController();
        fetchHolidays(controller.signal);
        return () => controller.abort();
    }, [fetchHolidays]);

    // Format date (YYYY-MM-DD → dd/mm/yyyy)
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    // Open create modal with reset form
    const handleOpenCreate = () => {
        setFormData({ date: '', name: '' });
        setFormError('');
        setCreateModal(true);
    };

    // Submit create holiday
    const handleCreateSubmit = async () => {
        // Client-side validation
        if (!formData.date) {
            setFormError('Vui lòng chọn ngày');
            return;
        }
        if (!formData.name.trim()) {
            setFormError('Vui lòng nhập tên ngày nghỉ');
            return;
        }

        setFormLoading(true);
        setFormError('');
        try {
            await createHoliday({
                date: formData.date,
                name: formData.name.trim()
            });
            setCreateModal(false);
            showToast('Tạo ngày nghỉ thành công!', 'success');
            fetchHolidays(); // Refresh list
        } catch (err) {
            // Handle duplicate date (409)
            if (err.response?.status === 409) {
                setFormError('Ngày này đã có trong danh sách ngày nghỉ');
            } else {
                setFormError(err.response?.data?.message || 'Tạo ngày nghỉ thất bại');
            }
        } finally {
            setFormLoading(false);
        }
    };

    // Toast helper
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    return (
        <div>
            <PageHeader title="Quản lý ngày nghỉ">
                <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-28"
                >
                    {yearOptions.map((year) => (
                        <option key={year} value={year}>{year}</option>
                    ))}
                </Select>
                <Button color="success" onClick={handleOpenCreate}>
                    <HiPlus className="mr-2 h-4 w-4" />
                    Thêm ngày nghỉ
                </Button>
            </PageHeader>

            {/* Error alert */}
            {error && (
                <Alert color="failure" className="mb-4">
                    {error}
                </Alert>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spinner size="lg" />
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && holidays.length === 0 && (
                <Alert color="info">
                    Không có ngày nghỉ nào trong năm {selectedYear}.
                </Alert>
            )}

            {/* Holidays table */}
            {!loading && holidays.length > 0 && (
                <div className="overflow-x-auto">
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Ngày</Table.HeadCell>
                            <Table.HeadCell>Tên</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {holidays.map((holiday) => (
                                <Table.Row key={holiday._id} className="bg-white">
                                    <Table.Cell className="font-medium text-gray-900">
                                        {formatDate(holiday.date)}
                                    </Table.Cell>
                                    <Table.Cell>{holiday.name}</Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}

            {/* Summary */}
            {!loading && holidays.length > 0 && (
                <p className="mt-4 text-sm text-gray-500">
                    Tổng: {holidays.length} ngày nghỉ
                </p>
            )}

            {/* Create Holiday Modal */}
            <Modal show={createModal} onClose={() => setCreateModal(false)}>
                <Modal.Header>Thêm ngày nghỉ</Modal.Header>
                <Modal.Body>
                    {formError && (
                        <Alert color="failure" className="mb-4">{formError}</Alert>
                    )}
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="holiday-date" value="Ngày *" />
                            <TextInput
                                id="holiday-date"
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="holiday-name" value="Tên ngày nghỉ *" />
                            <TextInput
                                id="holiday-name"
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="VD: Tết Dương lịch"
                                required
                            />
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={handleCreateSubmit} disabled={formLoading}>
                        {formLoading ? <Spinner size="sm" className="mr-2" /> : <HiCheck className="mr-2" />}
                        Lưu
                    </Button>
                    <Button color="gray" onClick={() => setCreateModal(false)}>
                        Hủy
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Toast */}
            {toast.show && (
                <div className="fixed bottom-4 right-4 z-50">
                    <Toast>
                        <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            toast.type === 'success'
                                ? 'bg-green-100 text-green-500'
                                : 'bg-red-100 text-red-500'
                        }`}>
                            {toast.type === 'success' ? <HiCheck className="h-5 w-5" /> : <HiX className="h-5 w-5" />}
                        </div>
                        <div className="ml-3 text-sm font-normal">{toast.message}</div>
                        <Toast.Toggle onClick={() => setToast({ ...toast, show: false })} />
                    </Toast>
                </div>
            )}
        </div>
    );
}
