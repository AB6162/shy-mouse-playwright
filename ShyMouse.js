/**
 * ShyMouse - Advanced Human-like Mouse Simulation
 * Optimized for Patchright/Playwright with anti-detection capabilities
 * Version: 2.0 - Production Ready
 * Compatible with Facebook, Twitter/X, Instagram, TikTok anti-bot systems
 */

class ShyMouse {
  constructor(page) {
    this.page = page;
    this.lastPos = null; // Start as null, will be initialized on first use
    this.lastMoveTime = Date.now();
    this.moveHistory = [];
    this.maxHistoryLength = 50;
    this.cachedViewport = null;
    this.viewportCacheTime = 0;
    this.viewportCacheDuration = 3000; // 3 seconds cache

    // Enhanced configuration with realistic human parameters
    this.config = {
      // Fatigue simulation (humans slow down over time)
      fatigueEnabled: true,
      fatigueThreshold: 20,
      actionCount: 0,
      maxFatigue: 100, // Auto-reset after this

      // Attention span (humans make mistakes)
      attentionSpan: Math.random() * 0.10 + 0.88, // 88-98% accuracy
      minAttentionSpan: 0.80,

      // Response time variability
      baseReactionTime: 180,
      reactionTimeVariance: 120,

      // Movement randomness seed (for more natural variation)
      randomnessSeed: Math.random() * 1000,
    };

    // Setup viewport monitoring
    this.setupViewportMonitoring();
  }

  /**
   * Setup viewport resize monitoring
   */
  setupViewportMonitoring() {
    try {
      // Inject resize listener to invalidate cache
      this.page.evaluate(() => {
        if (!window.__shyMouseListenerInstalled) {
          window.__shyMouseListenerInstalled = true;
          window.addEventListener('resize', () => {
            window.__viewportChanged = true;
          });
        }
      }).catch(() => {
        // Silently fail if page not ready
      });
    } catch (error) {
      // Page might not be ready yet
    }
  }

  /**
   * Get viewport dimensions with proper handling of configured viewport
   * Priority: page.viewportSize() > window.innerWidth/Height
   */
  async getViewport() {
    const now = Date.now();

    // Check if viewport changed
    const viewportChanged = await this.checkViewportChanged();

    if (this.cachedViewport && !viewportChanged && (now - this.viewportCacheTime) < this.viewportCacheDuration) {
      return this.cachedViewport;
    }

    try {
      // First, try to get configured viewport size
      let configuredViewport = null;
      try {
        configuredViewport = this.page.viewportSize();
      } catch (e) {
        // Method might not exist in some versions
      }

      // Get actual window dimensions and scroll
      const windowInfo = await this.page.evaluate(() => {
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
          scrollX: window.scrollX || window.pageXOffset || 0,
          scrollY: window.scrollY || window.pageYOffset || 0,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
        };
      });

      // Use configured viewport if available, otherwise use window dimensions
      const viewport = {
        width: configuredViewport?.width || windowInfo.innerWidth,
        height: configuredViewport?.height || windowInfo.innerHeight,
        scrollX: windowInfo.scrollX,
        scrollY: windowInfo.scrollY,
        devicePixelRatio: windowInfo.devicePixelRatio,
        documentWidth: windowInfo.documentWidth,
        documentHeight: windowInfo.documentHeight,
      };

      this.cachedViewport = viewport;
      this.viewportCacheTime = now;

      // Reset viewport change flag
      await this.page.evaluate(() => {
        window.__viewportChanged = false;
      }).catch(() => {});

      return viewport;
    } catch (error) {
      console.warn('Failed to get viewport, using fallback:', error.message);
      // Fallback to default viewport
      return {
        width: 1920,
        height: 1080,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        documentWidth: 1920,
        documentHeight: 1080,
      };
    }
  }

  /**
   * Check if viewport has changed
   */
  async checkViewportChanged() {
    try {
      return await this.page.evaluate(() => window.__viewportChanged || false);
    } catch (error) {
      return false;
    }
  }

  /**
   * Invalidate viewport cache
   */
  invalidateViewportCache() {
    this.cachedViewport = null;
    this.viewportCacheTime = 0;
  }

  /**
   * Get element's scroll container (handles nested scroll containers)
   */
  async getScrollContainer(element) {
    try {
      return await element.evaluate(el => {
        let parent = el.parentElement;
        while (parent) {
          const overflow = window.getComputedStyle(parent).overflow;
          const overflowY = window.getComputedStyle(parent).overflowY;
          const overflowX = window.getComputedStyle(parent).overflowX;

          if (/(auto|scroll)/.test(overflow + overflowY + overflowX)) {
            return {
              isWindow: false,
              scrollTop: parent.scrollTop,
              scrollLeft: parent.scrollLeft,
              scrollHeight: parent.scrollHeight,
              scrollWidth: parent.scrollWidth,
              clientHeight: parent.clientHeight,
              clientWidth: parent.clientWidth,
            };
          }
          parent = parent.parentElement;
        }

        // Default to window
        return {
          isWindow: true,
          scrollTop: window.scrollY || window.pageYOffset || 0,
          scrollLeft: window.scrollX || window.pageXOffset || 0,
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientHeight: window.innerHeight,
          clientWidth: window.innerWidth,
        };
      });
    } catch (error) {
      // Fallback to window scroll
      const viewport = await this.getViewport();
      return {
        isWindow: true,
        scrollTop: viewport.scrollY,
        scrollLeft: viewport.scrollX,
        scrollHeight: viewport.documentHeight,
        scrollWidth: viewport.documentWidth,
        clientHeight: viewport.height,
        clientWidth: viewport.width,
      };
    }
  }

  /**
   * Enhanced element visibility and clickability check
   */
  async isElementClickable(element) {
    try {
      const isClickable = await element.evaluate(el => {
        // Check if element is in DOM
        if (!el.isConnected) return false;

        // Get computed styles
        const style = window.getComputedStyle(el);

        // Check visibility
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;

        // Check if element has dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        // Check if element is in viewport
        if (rect.bottom < 0 || rect.right < 0) return false;
        if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false;

        // Check pointer-events
        if (style.pointerEvents === 'none') return false;

        // Check if element is covered by another element
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);

        if (!topElement) return false;

        // Check if the element or its parent is the top element
        let currentElement = topElement;
        while (currentElement) {
          if (currentElement === el) return true;
          currentElement = currentElement.parentElement;
        }

        return false;
      });

      return isClickable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced viewport visibility check with scroll container support
   */
  async isElementInViewport(element, buffer = 10) {
    try {
      const box = await this.getElementBoundingBox(element);
      if (!box) return false;

      const scrollContainer = await this.getScrollContainer(element);
      const viewport = await this.getViewport();

      let viewTop, viewBottom, viewLeft, viewRight;

      if (scrollContainer.isWindow) {
        viewTop = viewport.scrollY - buffer;
        viewBottom = viewport.scrollY + viewport.height + buffer;
        viewLeft = viewport.scrollX - buffer;
        viewRight = viewport.scrollX + viewport.width + buffer;
      } else {
        viewTop = scrollContainer.scrollTop - buffer;
        viewBottom = scrollContainer.scrollTop + scrollContainer.clientHeight + buffer;
        viewLeft = scrollContainer.scrollLeft - buffer;
        viewRight = scrollContainer.scrollLeft + scrollContainer.clientWidth + buffer;
      }

      // Check both vertical and horizontal visibility
      const verticallyVisible = (box.y < viewBottom && box.y + box.height > viewTop);
      const horizontallyVisible = (box.x < viewRight && box.x + box.width > viewLeft);

      return verticallyVisible && horizontallyVisible;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get element bounding box with retry logic
   */
  async getElementBoundingBox(element, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const box = await element.boundingBox();
        if (box) return box;

        // Wait a bit before retry (element might be animating)
        if (attempt < maxRetries - 1) {
          await this.randomDelay(50, 150);
        }
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(`Failed to get bounding box after ${maxRetries} attempts: ${error.message}`);
        }
        await this.randomDelay(100, 200);
      }
    }
    return null;
  }

  /**
   * Wait for element to be stable (no layout shifts)
   */
  async waitForElementStability(element, timeout = 1000) {
    const startTime = Date.now();
    let lastBox = null;
    let stableCount = 0;
    const requiredStableChecks = 3;

    while (Date.now() - startTime < timeout) {
      try {
        const box = await element.boundingBox();
        if (!box) {
          await this.randomDelay(50, 100);
          continue;
        }

        if (lastBox) {
          const xDiff = Math.abs(box.x - lastBox.x);
          const yDiff = Math.abs(box.y - lastBox.y);

          if (xDiff < 1 && yDiff < 1) {
            stableCount++;
            if (stableCount >= requiredStableChecks) {
              return box;
            }
          } else {
            stableCount = 0;
          }
        }

        lastBox = box;
        await this.randomDelay(50, 100);
      } catch (error) {
        await this.randomDelay(100, 200);
      }
    }

    // Return last known box if we couldn't get stable
    return lastBox;
  }

  /**
   * Enhanced scroll to element with container support
   */
  async scrollToElement(element, options = {}) {
    const viewport = await this.getViewport();

    // Check if already visible
    if (await this.isElementInViewport(element, options.visibilityBuffer ?? 50)) {
      // Add micro-scroll even if visible (humans adjust)
      if (Math.random() < 0.3) {
        const microScroll = this.randomGaussian(0, 15);
        await this.page.mouse.wheel(0, microScroll);
        await this.randomDelay(50, 150);
      }
      return;
    }

    const box = await this.getElementBoundingBox(element);
    if (!box) throw new Error('Element has no bounding box');

    const scrollContainer = await this.getScrollContainer(element);
    const targetPosition = options.targetPosition ?? 'center';

    let currentScroll, targetScroll;

    if (scrollContainer.isWindow) {
      currentScroll = viewport.scrollY;

      switch (targetPosition) {
        case 'top':
          targetScroll = box.y - (options.offset ?? 100);
          break;
        case 'bottom':
          targetScroll = box.y + box.height - viewport.height + (options.offset ?? 100);
          break;
        default: // center
          targetScroll = box.y + box.height / 2 - viewport.height / 2;
      }

      targetScroll = Math.max(0, Math.min(targetScroll, scrollContainer.scrollHeight - viewport.height));
    } else {
      // Scroll within container (use element.evaluate to scroll)
      currentScroll = scrollContainer.scrollTop;

      switch (targetPosition) {
        case 'top':
          targetScroll = box.y - (options.offset ?? 50);
          break;
        case 'bottom':
          targetScroll = box.y + box.height - scrollContainer.clientHeight + (options.offset ?? 50);
          break;
        default:
          targetScroll = box.y + box.height / 2 - scrollContainer.clientHeight / 2;
      }

      targetScroll = Math.max(0, Math.min(targetScroll, scrollContainer.scrollHeight - scrollContainer.clientHeight));
    }

    // Pre-scroll mouse movement
    await this.preScrollMouseMovement(viewport, options);

    const remainingDelta = Math.abs(targetScroll - currentScroll);
    const direction = targetScroll > currentScroll ? 1 : -1;

    // Enhanced Fitts's Law for scrolling
    const scrollID = Math.log2(remainingDelta / 100 + 1);
    const baseSteps = Math.max(5, Math.round(8 * scrollID));
    const numSteps = this.applyFatigue(baseSteps);

    // Overshoot probability
    const overshootProb = options.overshootProb ?? 0.2;
    const shouldOvershoot = remainingDelta > 200 &&
                            Math.random() < overshootProb &&
                            this.config.attentionSpan < 0.95;

    let overshootAmount = 0;
    if (shouldOvershoot) {
      overshootAmount = this.randomGaussian(0.15, 0.08) * viewport.height;
      overshootAmount = this.clamp(overshootAmount, 50, viewport.height * 0.4);
    }

    // Execute scroll
    await this.executeScrollSequence(
      targetScroll,
      direction,
      numSteps,
      overshootAmount,
      scrollContainer.isWindow,
      options
    );

    // Correction if overshot
    if (overshootAmount > 0) {
      await this.randomDelay(100, 300);
      await this.executeCorrectionScroll(
        targetScroll,
        direction,
        numSteps,
        scrollContainer.isWindow,
        options
      );
    }

    // Final micro-adjustment
    await this.randomDelay(100, 200);
    await this.finalScrollAdjustment(element, box);

    this.updateActionCount();
  }

  /**
   * Pre-scroll mouse positioning
   */
  async preScrollMouseMovement(viewport, options) {
    // Initialize position if needed
    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    const hoverTarget = {
      x: viewport.width * (0.3 + Math.random() * 0.4),
      y: viewport.height * (0.2 + Math.random() * 0.6)
    };

    const distance = this.calculateDistance(this.lastPos, hoverTarget);

    if (distance > 50) {
      await this.moveToPosition(hoverTarget.x, hoverTarget.y, {
        ...options,
        numPoints: Math.max(8, Math.round(distance / 50))
      });
    }
  }

  /**
   * Execute scroll sequence
   */
  async executeScrollSequence(targetScroll, direction, numSteps, overshootAmount, isWindow, options) {
    const jitterStdDev = options.scrollJitterStdDev ?? 20;
    let cumulativeT = 0;

    for (let i = 1; i <= numSteps; i++) {
      const currentScroll = await this.getCurrentScrollY();
      const remainingDelta = Math.abs(targetScroll - currentScroll);

      if (remainingDelta < 10) break;

      const linearT = i / numSteps;
      const easedT = this.easeInOutCubic(linearT);
      const stepFraction = easedT - cumulativeT;
      cumulativeT = easedT;

      let stepDelta = stepFraction * remainingDelta;

      // Natural jitter
      const distanceBasedJitter = Math.min(jitterStdDev, remainingDelta * 0.1);
      stepDelta += this.randomGaussian(0, distanceBasedJitter);

      // Realistic bounds
      stepDelta = this.clamp(stepDelta, 10, 200);

      // Add overshoot to final steps
      if (overshootAmount > 0 && i > numSteps * 0.7) {
        const overshootFraction = (i - numSteps * 0.7) / (numSteps * 0.3);
        stepDelta += overshootAmount * overshootFraction * 0.5;
      }

      if (isWindow) {
        await this.page.mouse.wheel(0, direction * stepDelta);
      } else {
        // For container scrolling, we can't use mouse.wheel as effectively
        // This is a limitation - in practice, most scrolling is window-level
        await this.page.mouse.wheel(0, direction * stepDelta);
      }

      // Variable delays
      const baseDelay = 20 + Math.random() * 80;
      const microPause = Math.random() < 0.15 ? Math.random() * 100 : 0;
      await this.randomDelay(baseDelay, baseDelay + microPause);

      // Occasional micro movement
      if (Math.random() < 0.2) {
        await this.microMouseAdjustment();
      }
    }
  }

  /**
   * Correction scroll
   */
  async executeCorrectionScroll(targetScroll, direction, numSteps, isWindow, options) {
    const correctionSteps = Math.max(3, Math.round(numSteps / 3));
    const jitterStdDev = (options.scrollJitterStdDev ?? 20) / 2;
    let correctionCumulativeT = 0;

    for (let i = 1; i <= correctionSteps; i++) {
      const currentScroll = await this.getCurrentScrollY();
      const correctionDelta = Math.abs(targetScroll - currentScroll);

      if (correctionDelta < 10) break;

      const linearT = i / correctionSteps;
      const easedT = this.easeInOutCubic(linearT);
      const stepFraction = easedT - correctionCumulativeT;
      correctionCumulativeT = easedT;

      let stepDelta = stepFraction * correctionDelta;
      stepDelta += this.randomGaussian(0, jitterStdDev);
      stepDelta = this.clamp(stepDelta, 10, 150);

      if (isWindow) {
        await this.page.mouse.wheel(0, -direction * stepDelta);
      } else {
        await this.page.mouse.wheel(0, -direction * stepDelta);
      }

      await this.randomDelay(10, 70);
    }
  }

  /**
   * Final scroll adjustment
   */
  async finalScrollAdjustment(element, box) {
    if (!await this.isElementInViewport(element, 0)) {
      const viewport = await this.getViewport();
      const finalScrollY = await this.getCurrentScrollY();
      const finalDelta = (box.y + box.height / 2 - viewport.height / 2) - finalScrollY;

      if (Math.abs(finalDelta) > 10) {
        const adjustments = Math.ceil(Math.abs(finalDelta) / 50);
        for (let i = 0; i < Math.min(adjustments, 3); i++) {
          const partialDelta = finalDelta / adjustments;
          await this.page.mouse.wheel(0, partialDelta);
          await this.randomDelay(30, 80);
        }
      }
    }
  }

  /**
   * Get current scroll Y position
   */
  async getCurrentScrollY() {
    try {
      return await this.page.evaluate(() => window.scrollY || window.pageYOffset || 0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Enhanced click with comprehensive checks and stability waiting
   */
  async click(element, options = {}) {
    // Wait for element to be clickable
    const maxWaitTime = options.waitTimeout ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (await this.isElementClickable(element)) {
        break;
      }
      await this.randomDelay(100, 200);
    }

    // Final clickability check
    if (!await this.isElementClickable(element)) {
      throw new Error('Element is not clickable');
    }

    // Wait for element stability (avoid layout shifts)
    const stableBox = await this.waitForElementStability(element, options.stabilityTimeout ?? 1000);
    if (!stableBox) {
      throw new Error('Element position is not stable');
    }

    const viewport = await this.getViewport();

    // Ensure element is visible with scroll
    try {
      await this.scrollToElement(element, options);
    } catch (error) {
      console.warn('Scroll to element failed:', error.message);
    }

    // Re-check element after scroll (position might have changed)
    await this.randomDelay(100, 200);

    // Get fresh bounding box after scroll
    const box = await this.getElementBoundingBox(element);
    if (!box) {
      throw new Error('Element bounding box not available after scroll');
    }

    // Human reaction delay
    await this.humanReactionDelay();

    // Calculate click target
    const clickTarget = this.calculateClickTarget(box, options);

    // Validate click target is within viewport
    clickTarget.x = this.clamp(clickTarget.x, 0, viewport.width - 1);
    clickTarget.y = this.clamp(clickTarget.y, 0, viewport.height - 1);

    // Move to approach target first
    const approachTarget = this.calculateApproachTarget(clickTarget, box);
    await this.moveToPosition(approachTarget.x, approachTarget.y, {
      ...options,
      isApproach: true
    });

    // Brief hover
    await this.randomDelay(100, 400);

    // Final adjustment to click point
    await this.moveToPosition(clickTarget.x, clickTarget.y, {
      ...options,
      numPoints: Math.max(3, Math.round(Math.random() * 5))
    });

    // Verify element is still clickable (final check before click)
    if (!await this.isElementClickable(element)) {
      throw new Error('Element became unclickable before click execution');
    }

    // Execute click with realistic timing
    const clickDuration = Math.max(30, Math.round(this.randomGaussian(70, 25)));

    try {
      await this.page.mouse.down();
      await this.randomDelay(clickDuration, clickDuration + 20);
      await this.page.mouse.up();
    } catch (error) {
      throw new Error(`Click execution failed: ${error.message}`);
    }

    // Post-click behavior
    await this.postClickBehavior(clickTarget, viewport, options);

    this.lastPos = clickTarget;
    this.updateActionCount();
  }

  /**
   * Calculate click target with Gaussian distribution
   */
  calculateClickTarget(box, options) {
    const clickPaddingFactor = options.clickPadding ?? 0.7;

    // Gaussian distribution centered on element center
    const offsetX = this.randomGaussian(0, box.width / 4) * clickPaddingFactor;
    const offsetY = this.randomGaussian(0, box.height / 4) * clickPaddingFactor;

    let targetX = box.x + box.width / 2 + offsetX;
    let targetY = box.y + box.height / 2 + offsetY;

    // Ensure within element bounds with margin
    const margin = Math.min(5, Math.min(box.width, box.height) * 0.1);
    targetX = this.clamp(targetX, box.x + margin, box.x + box.width - margin);
    targetY = this.clamp(targetY, box.y + margin, box.y + box.height - margin);

    return { x: targetX, y: targetY };
  }

  /**
   * Calculate approach target
   */
  calculateApproachTarget(clickTarget, box) {
    const distance = 20 + Math.random() * 30;
    const angle = Math.random() * Math.PI * 2;

    return {
      x: clickTarget.x + Math.cos(angle) * distance,
      y: clickTarget.y + Math.sin(angle) * distance
    };
  }

  /**
   * Post-click behavior
   */
  async postClickBehavior(clickTarget, viewport, options) {
    const behavior = Math.random();

    if (behavior < 0.4) {
      // Stay still
      await this.randomDelay(100, 500);
    } else if (behavior < 0.7) {
      // Small jitter
      const jitterX = clickTarget.x + this.randomGaussian(0, 8);
      const jitterY = clickTarget.y + this.randomGaussian(0, 8);

      await this.moveToPosition(
        this.clamp(jitterX, 0, viewport.width - 1),
        this.clamp(jitterY, 0, viewport.height - 1),
        { ...options, numPoints: 3 }
      );

      await this.randomDelay(50, 200);
    } else {
      // Move away
      const awayDistance = 30 + Math.random() * 70;
      const awayAngle = Math.random() * Math.PI * 2;
      const awayX = clickTarget.x + Math.cos(awayAngle) * awayDistance;
      const awayY = clickTarget.y + Math.sin(awayAngle) * awayDistance;

      await this.moveToPosition(
        this.clamp(awayX, 0, viewport.width - 1),
        this.clamp(awayY, 0, viewport.height - 1),
        options
      );
    }
  }

  /**
   * Random move within viewport
   */
  async move(options = {}) {
    const viewport = await this.getViewport();

    // Initialize position if needed
    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    // Generate natural target
    const padding = 50;
    const targetX = padding + Math.random() * (viewport.width - 2 * padding);
    const targetY = padding + Math.random() * (viewport.height - 2 * padding);

    await this.moveToPosition(targetX, targetY, options);
    this.updateActionCount();
  }

  /**
   * Core movement function
   */
  async moveToPosition(targetX, targetY, options = {}) {
    const viewport = await this.getViewport();

    // Initialize if needed
    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    // Validate target coordinates
    targetX = this.clamp(targetX, 0, viewport.width - 1);
    targetY = this.clamp(targetY, 0, viewport.height - 1);

    const { points } = this.calculateBezierPoints(
      this.lastPos.x,
      this.lastPos.y,
      targetX,
      targetY,
      null,
      viewport,
      options
    );

    // Execute movement
    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      // Ensure point is within viewport
      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      try {
        await this.page.mouse.move(point.x, point.y);
      } catch (error) {
        console.warn('Mouse move failed:', error.message);
        continue;
      }

      // Variable delay based on phase
      const phase = i / points.length;
      let delay;

      if (phase < 0.2) {
        delay = 5 + Math.random() * 8;
      } else if (phase > 0.8) {
        delay = 8 + Math.random() * 15;
      } else {
        delay = 5 + Math.random() * 12;
      }

      await this.randomDelay(delay, delay + 5);

      // Occasional micro-pause
      if (Math.random() < 0.02) {
        await this.randomDelay(30, 100);
      }
    }

    this.lastPos = { x: targetX, y: targetY };
    this.lastMoveTime = Date.now();
    this.addToHistory({ x: targetX, y: targetY, time: Date.now() });
  }

  /**
   * Calculate Bezier curve points
   */
  calculateBezierPoints(startX, startY, targetX, targetY, box, viewport, options) {
    const D = this.calculateDistance({ x: startX, y: startY }, { x: targetX, y: targetY });

    // Fitts's Law
    const W = box ? Math.min(box.width, box.height) : (options.defaultTargetWidth ?? 100);
    const ID = Math.log2(D / W + 1);

    let baseNumPoints = Math.max(15, Math.round(12 * ID));
    baseNumPoints = this.applyFatigue(baseNumPoints);
    const numPoints = options.numPoints ?? baseNumPoints;

    // Control points
    const { p0, p1, p2, p3 } = this.calculateControlPoints(
      startX, startY, targetX, targetY, D, options
    );

    // Generate points
    const jitterStdDev = options.jitterStdDev ?? 1.5;
    const points = [];

    for (let i = 1; i <= numPoints; i++) {
      const linearT = i / numPoints;
      const easedT = this.easeInOutCubic(linearT);

      let point = this.getBezierPoint(easedT, p0, p1, p2, p3);

      // Distance-based jitter
      const distanceToEnd = (1 - easedT) * D;
      const distanceBasedJitter = jitterStdDev * Math.min(1, distanceToEnd / 100);
      point.x += this.randomGaussian(0, distanceBasedJitter);
      point.y += this.randomGaussian(0, distanceBasedJitter);

      // Attention-based inaccuracy
      if (this.config.attentionSpan < 0.95 && Math.random() > this.config.attentionSpan) {
        point.x += this.randomGaussian(0, 3);
        point.y += this.randomGaussian(0, 3);
      }

      // Clamp to viewport (critical for anti-detection)
      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      points.push(point);
    }

    // Handle overshoot
    return this.handleOvershoot(startX, startY, targetX, targetY, box, viewport, points, options, D, W);
  }

  /**
   * Calculate control points for Bezier curve
   */
  calculateControlPoints(startX, startY, targetX, targetY, D, options) {
    const dx = targetX - startX;
    const dy = targetY - startY;

    // Variable curvature
    const baseDeviation = D * (0.15 + Math.random() * 0.25);
    const deviation = options.isApproach ? baseDeviation * 0.5 : baseDeviation;

    // Perpendicular vector
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / length;
    const perpY = dx / length;

    const randomSign = Math.random() < 0.5 ? -1 : 1;

    // Control point factors
    const c1Factor = 0.25 + Math.random() * 0.15;
    const c2Factor = 0.60 + Math.random() * 0.15;

    const c1x = startX + dx * c1Factor + randomSign * deviation * perpX * (0.5 + Math.random() * 0.5);
    const c1y = startY + dy * c1Factor + randomSign * deviation * perpY * (0.5 + Math.random() * 0.5);

    const c2x = startX + dx * c2Factor + randomSign * deviation * perpX * (0.5 + Math.random() * 0.5);
    const c2y = startY + dy * c2Factor + randomSign * deviation * perpY * (0.5 + Math.random() * 0.5);

    return {
      p0: { x: startX, y: startY },
      p1: { x: c1x, y: c1y },
      p2: { x: c2x, y: c2y },
      p3: { x: targetX, y: targetY }
    };
  }

  /**
   * Handle overshoot with proper viewport clamping
   */
  handleOvershoot(startX, startY, targetX, targetY, box, viewport, points, options, D, W) {
    const overshootProb = options.overshootProb ?? 0.2;
    const isRandomTarget = !box;
    const shouldOvershoot = !isRandomTarget &&
                            !options.isApproach &&
                            D > 100 &&
                            Math.random() < overshootProb &&
                            this.config.attentionSpan < 0.93;

    if (!shouldOvershoot) {
      return { points, finalPos: { x: targetX, y: targetY } };
    }

    // Calculate overshoot with viewport boundary consideration
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / length;
    const dirY = dy / length;

    const overshootFactor = 0.1 + Math.random() * 0.2;
    let overshootDist = overshootFactor * W;

    // Limit overshoot to stay within viewport
    let overshootX = targetX + dirX * overshootDist;
    let overshootY = targetY + dirY * overshootDist;

    // If overshoot would go out of bounds, reduce it
    if (overshootX < 0 || overshootX >= viewport.width ||
        overshootY < 0 || overshootY >= viewport.height) {
      overshootDist = overshootDist * 0.5;
      overshootX = targetX + dirX * overshootDist;
      overshootY = targetY + dirY * overshootDist;
    }

    // Final clamp
    overshootX = this.clamp(overshootX, 0, viewport.width - 1);
    overshootY = this.clamp(overshootY, 0, viewport.height - 1);

    // Generate overshoot path
    const overshootResult = this.calculateBezierPoints(
      startX, startY, overshootX, overshootY, box, viewport,
      { ...options, overshootProb: 0 }
    );

    // Generate correction path
    const correctionPoints = this.generateCorrectionPath(
      overshootX, overshootY, targetX, targetY, viewport, options
    );

    return {
      points: overshootResult.points.concat(correctionPoints),
      finalPos: { x: targetX, y: targetY }
    };
  }

  /**
   * Generate correction path
   */
  generateCorrectionPath(overshootX, overshootY, targetX, targetY, viewport, options) {
    const correctionD = this.calculateDistance(
      { x: overshootX, y: overshootY },
      { x: targetX, y: targetY }
    );

    const correctionNumPoints = Math.max(5, Math.round(correctionD / 10));
    const jitterStdDev = (options.jitterStdDev ?? 1.5) / 2;

    const dx = targetX - overshootX;
    const dy = targetY - overshootY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    const correctionDeviation = correctionD * (0.05 + Math.random() * 0.1);
    const perpX = -dy / length;
    const perpY = dx / length;
    const correctionSign = Math.random() < 0.5 ? -1 : 1;

    const c1x = overshootX + dx * 0.3 + correctionSign * correctionDeviation * perpX * Math.random();
    const c1y = overshootY + dy * 0.3 + correctionSign * correctionDeviation * perpY * Math.random();
    const c2x = overshootX + dx * 0.7 + correctionSign * correctionDeviation * perpX * Math.random();
    const c2y = overshootY + dy * 0.7 + correctionSign * correctionDeviation * perpY * Math.random();

    const p0 = { x: overshootX, y: overshootY };
    const p1 = { x: c1x, y: c1y };
    const p2 = { x: c2x, y: c2y };
    const p3 = { x: targetX, y: targetY };

    const correctionPoints = [];

    for (let i = 1; i <= correctionNumPoints; i++) {
      const linearT = i / correctionNumPoints;
      const easedT = this.easeInOutCubic(linearT);

      let point = this.getBezierPoint(easedT, p0, p1, p2, p3);
      point.x += this.randomGaussian(0, jitterStdDev);
      point.y += this.randomGaussian(0, jitterStdDev);

      // Critical: clamp all correction points
      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      correctionPoints.push(point);
    }

    return correctionPoints;
  }

  /**
   * Micro mouse adjustment
   */
  async microMouseAdjustment() {
    if (!this.lastPos) return;

    const currentPos = this.lastPos;
    const microX = currentPos.x + this.randomGaussian(0, 3);
    const microY = currentPos.y + this.randomGaussian(0, 3);

    const viewport = await this.getViewport();

    try {
      await this.page.mouse.move(
        this.clamp(microX, 0, viewport.width - 1),
        this.clamp(microY, 0, viewport.height - 1)
      );
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Get Bezier point
   */
  getBezierPoint(t, p0, p1, p2, p3) {
    const omt = 1 - t;
    const omt2 = omt * omt;
    const omt3 = omt2 * omt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: p0.x * omt3 + 3 * p1.x * omt2 * t + 3 * p2.x * omt * t2 + p3.x * t3,
      y: p0.y * omt3 + 3 * p1.y * omt2 * t + 3 * p2.y * omt * t2 + p3.y * t3
    };
  }

  /**
   * Enhanced easing with micro-variation
   */
  easeInOutCubic(t) {
    // Add micro-variation (±1%)
    const variance = (Math.random() - 0.5) * 0.02;
    t = this.clamp(t + variance, 0, 1);

    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Gaussian random (Box-Muller)
   */
  randomGaussian(mean = 0, stdDev = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  /**
   * Human reaction delay with enhanced variability
   */
  async humanReactionDelay() {
    const baseTime = this.config.baseReactionTime;
    const variance = this.config.reactionTimeVariance;

    // Add extra variability based on attention span
    const attentionFactor = 1 + (1 - this.config.attentionSpan) * 0.5;
    const reactionTime = Math.max(80, this.randomGaussian(baseTime * attentionFactor, variance));

    await this.randomDelay(reactionTime * 0.8, reactionTime * 1.2);
  }

  /**
   * Random delay with enhanced non-uniformity
   */
  async randomDelay(min, max) {
    // Add micro-variations to avoid uniform patterns
    const microVariation = (Math.random() - 0.5) * 10;
    const delay = min + Math.random() * (max - min) + microVariation;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
  }

  /**
   * Calculate distance
   */
  calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clamp value
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Initialize position randomly (NOT center)
   */
  initializePosition(viewport) {
    // Random position within safe bounds (not center, more natural)
    const margin = 100;
    const x = margin + Math.random() * (viewport.width - 2 * margin);
    const y = margin + Math.random() * (viewport.height - 2 * margin);

    this.lastPos = { x, y };
    this.lastMoveTime = Date.now();
  }

  /**
   * Apply fatigue with auto-recovery
   */
  applyFatigue(baseValue) {
    if (!this.config.fatigueEnabled) return baseValue;

    // Auto-reset if too fatigued
    if (this.config.actionCount > this.config.maxFatigue) {
      this.config.actionCount = this.config.fatigueThreshold;
      this.config.attentionSpan = Math.min(0.98, this.config.attentionSpan + 0.1);
    }

    if (this.config.actionCount > this.config.fatigueThreshold) {
      const fatigueMultiplier = 1 + (this.config.actionCount - this.config.fatigueThreshold) * 0.02;
      return Math.round(baseValue * Math.min(fatigueMultiplier, 1.5));
    }

    return baseValue;
  }

  /**
   * Update action count with periodic recovery
   */
  updateActionCount() {
    this.config.actionCount++;

    // Periodic recovery
    if (this.config.actionCount % 50 === 0) {
      this.config.actionCount = Math.max(0, this.config.actionCount - 20);
      this.config.attentionSpan = Math.min(0.98, this.config.attentionSpan + 0.05);
    }

    // Gradual attention decrease with floor
    this.config.attentionSpan = Math.max(
      this.config.minAttentionSpan,
      this.config.attentionSpan - 0.001
    );
  }

  /**
   * Add to history
   */
  addToHistory(position) {
    this.moveHistory.push(position);

    if (this.moveHistory.length > this.maxHistoryLength) {
      this.moveHistory.shift();
    }
  }

  /**
   * Get movement statistics
   */
  getMovementStats() {
    if (this.moveHistory.length < 2) return null;

    const distances = [];
    const timeDiffs = [];

    for (let i = 1; i < this.moveHistory.length; i++) {
      const dist = this.calculateDistance(this.moveHistory[i - 1], this.moveHistory[i]);
      const timeDiff = this.moveHistory[i].time - this.moveHistory[i - 1].time;

      distances.push(dist);
      timeDiffs.push(timeDiff);
    }

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const avgTime = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

    return {
      averageDistance: avgDistance,
      averageTime: avgTime,
      averageSpeed: avgDistance / avgTime,
      totalMoves: this.moveHistory.length,
      actionCount: this.config.actionCount,
      attentionSpan: this.config.attentionSpan
    };
  }

  /**
   * Reset state
   */
  reset() {
    this.config.actionCount = 0;
    this.config.attentionSpan = Math.random() * 0.10 + 0.88;
    this.moveHistory = [];
    this.lastPos = null; // Will be reinitialized on next use
    this.invalidateViewportCache();
  }
}

module.exports = ShyMouse;