/**
 * XSS (Cross-Site Scripting) Prevention Tests
 * 
 * Test Design: Experience-Based Testing (ISTQB)
 * Test Type: Security
 * Priority: CRITICAL
 * ISO 25010: Security - Confidentiality, Integrity
 * 
 * Test Approach:
 * - React escapes content by default when using {} interpolation
 * - Tests verify malicious input is rendered as text, NOT as DOM elements
 * - Check both textContent (user sees) and innerHTML (HTML entities)
 * - Verify no dangerous DOM elements are created within component container
 * 
 * Note: JSDOM doesn't execute <script> tags, so these tests focus on
 * DOM structure verification rather than execution prevention.
 * 
 * Codebase Analysis:
 * - NO dangerouslySetInnerHTML usage in src/
 * - NO innerHTML direct manipulation
 * - NO Markdown/RichText parsers
 * → These are regression tests to prevent future vulnerabilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Components that render user input
import RequestsPage from '../../src/pages/RequestsPage';

// Mock API client
vi.mock('../../src/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
    },
}));

import client from '../../src/api/client';

// Mock useAuth for RequestsPage
vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { _id: '1', name: 'Test', role: 'EMPLOYEE' },
        token: 'test-token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
    })),
    AuthProvider: ({ children }) => <>{children}</>,
}));

describe('XSS Prevention - Security Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Default mock for requests fetching
        client.get.mockResolvedValue({ data: { items: [] } });
    });

    describe('1. Form Input XSS Prevention', () => {
        it('[XSS-01] Script tag in user-typed input is safely stored (not executed)', async () => {
            const xssPayload = '<script>alert("xss")</script>';

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            // Wait for form to render
            await screen.findByLabelText(/lý do/i);

            const reasonInput = screen.getByLabelText(/lý do/i);
            fireEvent.change(reasonInput, { target: { value: xssPayload } });

            // Input should contain the raw value (not executed)
            expect(reasonInput.value).toBe(xssPayload);

            // CRITICAL: No script element should be created in component container
            const scriptTag = container.querySelector('script');
            expect(scriptTag).toBeNull();
        });

        it('[XSS-02] Break-out attempt in input is safely stored', async () => {
            const xssPayload = '"><script>alert(document.domain)</script>';

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            await screen.findByLabelText(/lý do/i);
            const reasonInput = screen.getByLabelText(/lý do/i);
            fireEvent.change(reasonInput, { target: { value: xssPayload } });

            expect(reasonInput.value).toBe(xssPayload);

            // No script element created from break-out attempt
            expect(container.querySelector('script')).toBeNull();
        });
    });

    describe('2. API Response XSS Prevention (Reason Display)', () => {
        it('[XSS-03] Script tag in reason from API is rendered as escaped text', async () => {
            const xssPayload = '<script>alert("xss")</script>';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '1',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            // Wait for table to render
            const reasonCell = await screen.findByText(xssPayload);

            // 1. User sees the payload as text (textContent shows raw chars)
            expect(reasonCell).toHaveTextContent(xssPayload);

            // 2. CRITICAL: No script element created in container
            expect(container.querySelector('script')).toBeNull();

            // 3. HTML contains entities (React escaped it)
            expect(reasonCell.innerHTML).toContain('&lt;script&gt;');
            expect(reasonCell.innerHTML).toContain('&lt;/script&gt;');
        });

        it('[XSS-04] onerror handler in img tag - no img element created', async () => {
            const xssPayload = '<img src=x onerror="alert(1)">';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '2',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            const reasonCell = await screen.findByText(xssPayload);

            // Text content shows the payload
            expect(reasonCell).toHaveTextContent(xssPayload);

            // CRITICAL: No img element with src="x" should exist
            expect(container.querySelector('img[src="x"]')).toBeNull();

            // No img element with onerror attribute
            expect(container.querySelector('img[onerror]')).toBeNull();
        });

        it('[XSS-05] onclick handler injection - no element with onclick created', async () => {
            const xssPayload = '<div onclick="alert(1)">click me</div>';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '3',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'APPROVED',
                        requestedCheckInAt: '2026-01-19T08:00:00+07:00',
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            const reasonCell = await screen.findByText(xssPayload);

            // Text is displayed
            expect(reasonCell).toHaveTextContent(xssPayload);

            // CRITICAL: No div with onclick attribute should be created from payload
            // Note: The container has divs, but none should have onclick from XSS
            expect(container.querySelector('[onclick]')).toBeNull();
        });
    });

    describe('3. URL-based XSS (javascript: protocol)', () => {
        it('[XSS-06] javascript: protocol in href - no dangerous link created', async () => {
            const xssPayload = '<a href="javascript:alert(1)">click</a>';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '4',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            await screen.findByText(xssPayload);

            // CRITICAL: No anchor with javascript: protocol should exist
            expect(container.querySelector('a[href^="javascript:"]')).toBeNull();

            // Also check for data: protocol (another XSS vector)
            expect(container.querySelector('a[href^="data:"]')).toBeNull();
        });
    });

    describe('4. Template Literal Injection', () => {
        it('[XSS-07] ${} in reason is displayed as literal text', async () => {
            const xssPayload = '${alert("xss")}';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '5',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            // Template literal displayed as-is (no evaluation)
            const reasonCell = await screen.findByText(xssPayload);
            expect(reasonCell).toHaveTextContent(xssPayload);
        });
    });

    describe('5. HTML Entity Encoding Verification', () => {
        it('[XSS-08] Special chars are escaped in innerHTML but visible in textContent', async () => {
            const xssPayload = '<>&"\'';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '6',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            const reasonCell = await screen.findByText(xssPayload);

            // textContent shows raw characters (what user sees)
            expect(reasonCell.textContent).toBe(xssPayload);

            // innerHTML has HTML entities (escaped by React)
            expect(reasonCell.innerHTML).toContain('&lt;');
            expect(reasonCell.innerHTML).toContain('&gt;');
            expect(reasonCell.innerHTML).toContain('&amp;');
        });
    });

    describe('6. SVG-based XSS Prevention', () => {
        it('[XSS-09] SVG onload handler - no SVG element created', async () => {
            const xssPayload = '<svg onload="alert(1)">';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '7',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            await screen.findByText(xssPayload);

            // No SVG with onload should be created
            expect(container.querySelector('svg[onload]')).toBeNull();
        });
    });

    describe('7. Input Attribute Injection', () => {
        it('[XSS-10] onfocus handler injection - no element with onfocus created', async () => {
            const xssPayload = '" onfocus="alert(1)" autofocus="';

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        _id: '8',
                        date: '2026-01-19',
                        reason: xssPayload,
                        status: 'PENDING',
                        requestedCheckInAt: null,
                        requestedCheckOutAt: null,
                        createdAt: new Date().toISOString(),
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <RequestsPage />
                </MemoryRouter>
            );

            await screen.findByText(xssPayload);

            // No element should have onfocus from XSS injection
            expect(container.querySelector('[onfocus]')).toBeNull();
        });
    });
});
