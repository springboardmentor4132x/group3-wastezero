import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  Inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface PickupRequest {
  id: number;
  wasteType: string;
  description: string;
  quantity: string;
  address: string;
  date: string;
  time: string;
  contact: string;
  status: 'Open' | 'Accepted' | 'Completed';
}

interface ChatMessage {
  text: string;
  sender: 'user' | 'volunteer';
  time: string;
}

interface Opportunity {
  id: number;
  wasteType: string;
  location: string;
  date: string;
  time: string;
  status: 'Open' | 'Assigned';
  quantity: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private isBrowser: boolean;
  private observers: IntersectionObserver[] = [];
  private counterAnimated = new Set<Element>();
  private reducedMotion = false;

  // Navbar
  isLoggedIn = signal(false);
  mobileMenuOpen = signal(false);
  navScrolled = signal(false);

  // Stats
  stats = [
    { label: 'Pickups Completed', value: 12400, suffix: '+', current: 0 },
    { label: 'Active Volunteers', value: 580, suffix: '+', current: 0 },
    { label: 'Cities Covered', value: 45, suffix: '', current: 0 },
    { label: 'Tons Recycled', value: 3200, suffix: 'T', current: 0 },
  ];

  // Timeline steps
  timelineSteps = [
    { icon: 'bi-plus-circle', title: 'User Creates Pickup', desc: 'Citizen schedules a waste pickup request via the app.' },
    { icon: 'bi-folder2-open', title: 'Status: Open', desc: 'Request enters the system and becomes visible to volunteers.' },
    { icon: 'bi-eye', title: 'Volunteer Sees Opportunity', desc: 'Nearby volunteers are notified of the new pickup.' },
    { icon: 'bi-hand-thumbs-up', title: 'Volunteer Accepts', desc: 'A volunteer reviews details and accepts the request.' },
    { icon: 'bi-check2-circle', title: 'Status: Accepted', desc: 'Request is assigned. User is notified with volunteer details.' },
    { icon: 'bi-truck', title: 'Waste Collected', desc: 'Volunteer arrives, collects waste, and logs the pickup.' },
    { icon: 'bi-patch-check', title: 'Status: Completed', desc: 'Pickup marked complete. Impact metrics are updated.' },
    { icon: 'bi-bar-chart-line', title: 'Report Generated', desc: 'Admin includes data in platform-wide analytics reports.' },
  ];
  activeTimelineStep = signal(0);

  // Feature cards
  features = [
    { icon: 'bi-calendar-check', title: 'Easy Scheduling', desc: 'Book a waste pickup in under a minute. Choose waste type, time, and location.' },
    { icon: 'bi-person-badge', title: 'Verified Volunteers', desc: 'All pickup agents are verified, trained, and tracked for accountability.' },
    { icon: 'bi-graph-up-arrow', title: 'Transparent Reporting', desc: 'Real-time dashboards and exportable reports for full visibility.' },
  ];

  // Waste categories
  wasteCategories = [
    { name: 'Plastic', color: '#1565c0', bg: '#e3f2fd' },
    { name: 'Organic', color: '#2e7d32', bg: '#e8f5e9' },
    { name: 'E-Waste', color: '#c62828', bg: '#fce4ec' },
    { name: 'Metal', color: '#6a1b9a', bg: '#f3e5f5' },
    { name: 'Other', color: '#424242', bg: '#f5f5f5' },
  ];

  // Schedule Pickup Form
  pickupForm = {
    wasteType: '',
    description: '',
    quantity: '',
    address: '',
    date: '',
    time: '',
    contact: '',
  };
  formErrors: Record<string, string> = {};
  formSubmitted = signal(false);
  showToast = signal(false);
  createdRequests = signal<PickupRequest[]>([]);

  // Volunteer Opportunities
  opportunities = signal<Opportunity[]>([
    { id: 1, wasteType: 'Plastic', location: 'Sector 21, Chandigarh', date: '2026-03-02', time: '10:00 AM', status: 'Open', quantity: '5 kg' },
    { id: 2, wasteType: 'E-Waste', location: 'MG Road, Bangalore', date: '2026-03-03', time: '2:00 PM', status: 'Open', quantity: '3 items' },
    { id: 3, wasteType: 'Organic', location: 'Andheri West, Mumbai', date: '2026-03-04', time: '9:00 AM', status: 'Open', quantity: '8 kg' },
    { id: 4, wasteType: 'Metal', location: 'Salt Lake, Kolkata', date: '2026-03-05', time: '11:30 AM', status: 'Open', quantity: '12 kg' },
  ]);
  showAcceptModal = signal(false);
  selectedOpportunity = signal<Opportunity | null>(null);

  // Messaging
  chatMessages = signal<ChatMessage[]>([
    { text: 'Hi! I\'ve scheduled a pickup for plastic waste at Sector 21.', sender: 'user', time: '10:15 AM' },
    { text: 'Got it! I\'ll be there by 10:30 AM. Please keep the bags ready near the gate.', sender: 'volunteer', time: '10:16 AM' },
    { text: 'Sure, they\'re already packed. Three bags total.', sender: 'user', time: '10:17 AM' },
    { text: 'Perfect. On my way now! 🚛', sender: 'volunteer', time: '10:20 AM' },
  ]);
  newMessage = signal('');
  showTyping = signal(false);

  // Active dashboard tab
  activeDashboard = signal<'user' | 'volunteer' | 'admin'>('user');

  // Report filter
  reportFilter = {
    dateRange: 'last30',
    wasteCategory: 'all',
    volunteer: 'all',
  };

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private el: ElementRef,
    private router: Router,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Check if user is logged in
      const token = localStorage.getItem('token');
      this.isLoggedIn.set(!!token);
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.setupScrollReveal();
    this.setupCounters();
    this.setupTimelineObserver();
    this.setupNavScroll();
    this.setupCharts();
  }

  ngOnDestroy(): void {
    this.observers.forEach(obs => obs.disconnect());
  }

  // ─── Navbar ────────────────────────────────────────
  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  private setupNavScroll(): void {
    if (!this.isBrowser) return;
    let ticking = false;
    const handler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.navScrolled.set(window.scrollY > 40);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
  }

  scrollTo(sectionId: string): void {
    if (!this.isBrowser) return;
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth' });
      this.mobileMenuOpen.set(false);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth']);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ─── Scroll Reveal ─────────────────────────────────
  private setupScrollReveal(): void {
    const reveals = this.el.nativeElement.querySelectorAll('.reveal');
    if (!reveals.length) return;

    if (this.reducedMotion) {
      reveals.forEach((el: HTMLElement) => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach((el: Element) => observer.observe(el));
    this.observers.push(observer);
  }

  // ─── Animated Counters ─────────────────────────────
  private setupCounters(): void {
    const counters = this.el.nativeElement.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.counterAnimated.has(entry.target)) {
            this.counterAnimated.add(entry.target);
            this.animateCounter(entry.target as HTMLElement);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el: Element) => observer.observe(el));
    this.observers.push(observer);
  }

  private animateCounter(el: HTMLElement): void {
    const target = parseInt(el.getAttribute('data-counter') || '0', 10);
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = this.reducedMotion ? 0 : 1800;
    const start = performance.now();

    const update = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    if (duration === 0) {
      el.textContent = target.toLocaleString() + suffix;
    } else {
      requestAnimationFrame(update);
    }
  }

  // ─── Timeline Observer ─────────────────────────────
  private setupTimelineObserver(): void {
    const items = this.el.nativeElement.querySelectorAll('.timeline-item');
    if (!items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = parseInt((entry.target as HTMLElement).getAttribute('data-step') || '0', 10);
            this.activeTimelineStep.set(idx);
            (entry.target as HTMLElement).classList.add('timeline-active');
          }
        });
      },
      { threshold: 0.6 }
    );

    items.forEach((el: Element) => observer.observe(el));
    this.observers.push(observer);
  }

  // ─── Charts (D3) ──────────────────────────────────
  private setupCharts(): void {
    // We'll draw charts when the report section scrolls into view
    const reportSection = this.el.nativeElement.querySelector('#reporting');
    if (!reportSection) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.drawLineChart();
            this.drawDonutChart();
            this.drawBarChart();
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(reportSection);
    this.observers.push(observer);
  }

  private drawLineChart(): void {
    const container = this.el.nativeElement.querySelector('#line-chart');
    if (!container) return;

    const data = [320, 480, 410, 560, 620, 710, 680, 820, 900, 1050, 980, 1180];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const w = container.clientWidth || 400;
    const h = 220;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', `${h}`);

    const maxVal = Math.max(...data);
    const xStep = (w - padding.left - padding.right) / (data.length - 1);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + ((h - padding.top - padding.bottom) / 4) * i;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${padding.left}`);
      line.setAttribute('x2', `${w - padding.right}`);
      line.setAttribute('y1', `${y}`);
      line.setAttribute('y2', `${y}`);
      line.setAttribute('stroke', '#e2e8f0');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', `${padding.left - 8}`);
      label.setAttribute('y', `${y + 4}`);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill', '#94a3b8');
      label.setAttribute('font-size', '11');
      label.textContent = `${Math.round(maxVal - (maxVal / 4) * i)}`;
      svg.appendChild(label);
    }

    // X-axis labels
    data.forEach((_, i) => {
      const x = padding.left + i * xStep;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', `${x}`);
      label.setAttribute('y', `${h - 6}`);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#94a3b8');
      label.setAttribute('font-size', '11');
      label.textContent = months[i];
      svg.appendChild(label);
    });

    // Area
    const areaPoints = data.map((v, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + (1 - v / maxVal) * (h - padding.top - padding.bottom);
      return `${x},${y}`;
    });
    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const firstX = padding.left;
    const lastX = padding.left + (data.length - 1) * xStep;
    const baseY = h - padding.bottom;
    areaPath.setAttribute('points', `${firstX},${baseY} ${areaPoints.join(' ')} ${lastX},${baseY}`);
    areaPath.setAttribute('fill', 'url(#lineGradient)');
    areaPath.setAttribute('opacity', '0.15');

    // Gradient
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'lineGradient');
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#2e7d32');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#2e7d32');
    stop2.setAttribute('stop-opacity', '0');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);
    svg.appendChild(areaPath);

    // Line
    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    linePath.setAttribute('points', areaPoints.join(' '));
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', '#2e7d32');
    linePath.setAttribute('stroke-width', '2.5');
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('stroke-linejoin', 'round');
    if (!this.reducedMotion) {
      const totalLen = data.length * xStep;
      linePath.setAttribute('stroke-dasharray', `${totalLen}`);
      linePath.setAttribute('stroke-dashoffset', `${totalLen}`);
      linePath.style.animation = 'dashDraw 1.5s ease-out forwards';
    }
    svg.appendChild(linePath);

    // Dots
    data.forEach((v, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + (1 - v / maxVal) * (h - padding.top - padding.bottom);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', `${x}`);
      circle.setAttribute('cy', `${y}`);
      circle.setAttribute('r', '3.5');
      circle.setAttribute('fill', '#2e7d32');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      if (!this.reducedMotion) {
        circle.style.opacity = '0';
        circle.style.animation = `fadeIn 0.3s ease ${0.12 * i}s forwards`;
      }
      svg.appendChild(circle);
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  private drawDonutChart(): void {
    const container = this.el.nativeElement.querySelector('#donut-chart');
    if (!container) return;

    const data = [
      { label: 'Plastic', value: 35, color: '#1565c0' },
      { label: 'Organic', value: 28, color: '#2e7d32' },
      { label: 'E-Waste', value: 18, color: '#c62828' },
      { label: 'Metal', value: 12, color: '#6a1b9a' },
      { label: 'Other', value: 7, color: '#757575' },
    ];

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 75;
    const innerRadius = 48;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', '200');
    svg.setAttribute('height', '200');

    const total = data.reduce((s, d) => s + d.value, 0);
    let currentAngle = -Math.PI / 2;

    data.forEach((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      const x1 = cx + radius * Math.cos(currentAngle);
      const y1 = cy + radius * Math.sin(currentAngle);
      const x2 = cx + radius * Math.cos(currentAngle + angle);
      const y2 = cy + radius * Math.sin(currentAngle + angle);
      const ix1 = cx + innerRadius * Math.cos(currentAngle + angle);
      const iy1 = cy + innerRadius * Math.sin(currentAngle + angle);
      const ix2 = cx + innerRadius * Math.cos(currentAngle);
      const iy2 = cy + innerRadius * Math.sin(currentAngle);
      const largeArc = angle > Math.PI ? 1 : 0;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`);
      path.setAttribute('fill', d.color);
      if (!this.reducedMotion) {
        path.style.opacity = '0';
        path.style.animation = `fadeIn 0.4s ease ${0.15 * i}s forwards`;
      }
      svg.appendChild(path);
      currentAngle += angle;
    });

    // Center text
    const centerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    centerText.setAttribute('x', `${cx}`);
    centerText.setAttribute('y', `${cy - 4}`);
    centerText.setAttribute('text-anchor', 'middle');
    centerText.setAttribute('fill', '#1e293b');
    centerText.setAttribute('font-size', '18');
    centerText.setAttribute('font-weight', '700');
    centerText.textContent = '8,920';
    svg.appendChild(centerText);
    const subText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subText.setAttribute('x', `${cx}`);
    subText.setAttribute('y', `${cy + 14}`);
    subText.setAttribute('text-anchor', 'middle');
    subText.setAttribute('fill', '#94a3b8');
    subText.setAttribute('font-size', '11');
    subText.textContent = 'Total Pickups';
    svg.appendChild(subText);

    // Legend
    const legendDiv = document.createElement('div');
    legendDiv.className = 'chart-legend';
    data.forEach((d) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${d.color}"></span><span class="legend-label">${d.label}</span><span class="legend-value">${d.value}%</span>`;
      legendDiv.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(svg);
    container.appendChild(legendDiv);
  }

  private drawBarChart(): void {
    const container = this.el.nativeElement.querySelector('#bar-chart');
    if (!container) return;

    const data = [
      { label: 'Amit', value: 42 },
      { label: 'Priya', value: 38 },
      { label: 'Raj', value: 35 },
      { label: 'Sneha', value: 30 },
      { label: 'Vikram', value: 28 },
      { label: 'Anita', value: 24 },
    ];

    const w = container.clientWidth || 400;
    const h = 220;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const maxVal = Math.max(...data.map(d => d.value));
    const barWidth = Math.min(40, (w - padding.left - padding.right) / data.length - 12);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', `${h}`);

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + ((h - padding.top - padding.bottom) / 4) * i;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${padding.left}`);
      line.setAttribute('x2', `${w - padding.right}`);
      line.setAttribute('y1', `${y}`);
      line.setAttribute('y2', `${y}`);
      line.setAttribute('stroke', '#e2e8f0');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', `${padding.left - 8}`);
      label.setAttribute('y', `${y + 4}`);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill', '#94a3b8');
      label.setAttribute('font-size', '11');
      label.textContent = `${Math.round(maxVal - (maxVal / 4) * i)}`;
      svg.appendChild(label);
    }

    const groupWidth = (w - padding.left - padding.right) / data.length;

    data.forEach((d, i) => {
      const barH = (d.value / maxVal) * (h - padding.top - padding.bottom);
      const x = padding.left + i * groupWidth + (groupWidth - barWidth) / 2;
      const y = h - padding.bottom - barH;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('width', `${barWidth}`);
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', i % 2 === 0 ? '#2e7d32' : '#4caf50');

      if (!this.reducedMotion) {
        rect.setAttribute('y', `${h - padding.bottom}`);
        rect.setAttribute('height', '0');
        rect.style.transition = `all 0.5s ease ${0.1 * i}s`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            rect.setAttribute('y', `${y}`);
            rect.setAttribute('height', `${barH}`);
          });
        });
      } else {
        rect.setAttribute('y', `${y}`);
        rect.setAttribute('height', `${barH}`);
      }
      svg.appendChild(rect);

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', `${x + barWidth / 2}`);
      label.setAttribute('y', `${h - 6}`);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#64748b');
      label.setAttribute('font-size', '11');
      label.textContent = d.label;
      svg.appendChild(label);

      // Value on top
      const valText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valText.setAttribute('x', `${x + barWidth / 2}`);
      valText.setAttribute('y', `${y - 6}`);
      valText.setAttribute('text-anchor', 'middle');
      valText.setAttribute('fill', '#1e293b');
      valText.setAttribute('font-size', '12');
      valText.setAttribute('font-weight', '600');
      valText.textContent = `${d.value}`;
      if (!this.reducedMotion) {
        valText.style.opacity = '0';
        valText.style.animation = `fadeIn 0.3s ease ${0.1 * i + 0.4}s forwards`;
      }
      svg.appendChild(valText);
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  // ─── Schedule Pickup Form ──────────────────────────
  validateForm(): boolean {
    this.formErrors = {};
    if (!this.pickupForm.wasteType) this.formErrors['wasteType'] = 'Please select a waste type.';
    if (!this.pickupForm.description.trim()) this.formErrors['description'] = 'Description is required.';
    if (!this.pickupForm.quantity.trim()) this.formErrors['quantity'] = 'Estimated quantity is required.';
    if (!this.pickupForm.address.trim()) this.formErrors['address'] = 'Pickup address is required.';
    if (!this.pickupForm.date) this.formErrors['date'] = 'Date is required.';
    if (!this.pickupForm.time) this.formErrors['time'] = 'Time is required.';
    if (!this.pickupForm.contact.trim()) this.formErrors['contact'] = 'Contact details are required.';
    return Object.keys(this.formErrors).length === 0;
  }

  submitPickup(): void {
    if (!this.validateForm()) return;

    const newReq: PickupRequest = {
      id: Date.now(),
      wasteType: this.pickupForm.wasteType,
      description: this.pickupForm.description,
      quantity: this.pickupForm.quantity,
      address: this.pickupForm.address,
      date: this.pickupForm.date,
      time: this.pickupForm.time,
      contact: this.pickupForm.contact,
      status: 'Open',
    };

    this.createdRequests.update(reqs => [newReq, ...reqs]);
    this.formSubmitted.set(true);
    this.showToast.set(true);

    // Reset form
    this.pickupForm = {
      wasteType: '',
      description: '',
      quantity: '',
      address: '',
      date: '',
      time: '',
      contact: '',
    };

    setTimeout(() => this.showToast.set(false), 3500);
  }

  // ─── Volunteer Opportunities ───────────────────────
  openAcceptModal(opp: Opportunity): void {
    this.selectedOpportunity.set(opp);
    this.showAcceptModal.set(true);
  }

  confirmAccept(): void {
    const opp = this.selectedOpportunity();
    if (!opp) return;
    this.opportunities.update(list =>
      list.map(o => o.id === opp.id ? { ...o, status: 'Assigned' as const } : o)
    );
    this.showAcceptModal.set(false);
    this.selectedOpportunity.set(null);
  }

  cancelAccept(): void {
    this.showAcceptModal.set(false);
    this.selectedOpportunity.set(null);
  }

  // ─── Messaging ─────────────────────────────────────
  sendMessage(): void {
    const text = this.newMessage().trim();
    if (!text) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    this.chatMessages.update(msgs => [...msgs, { text, sender: 'user', time: timeStr }]);
    this.newMessage.set('');

    // Simulate typing
    this.showTyping.set(true);
    setTimeout(() => {
      this.showTyping.set(false);
      const replies = [
        'Thanks for the update! I\'ll note that down.',
        'Got it! Almost there.',
        'Understood. See you soon!',
        'No problem, I\'ll handle it.',
      ];
      const reply = replies[Math.floor(Math.random() * replies.length)];
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.chatMessages.update(msgs => [...msgs, { text: reply, sender: 'volunteer', time: replyTime }]);
    }, 1800);
  }

  onMessageKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  // ─── Utility ───────────────────────────────────────
  getWasteClass(type: string): string {
    return `waste-${type.replace(/\s+/g, '-')}`;
  }

  trackById(index: number, item: { id: number }): number {
    return item.id;
  }
}
