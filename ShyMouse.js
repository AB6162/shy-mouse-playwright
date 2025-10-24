/**
 * ShyMouse - Advanced Human-like Mouse Simulation
 * Optimized for Patchright/Playwright with anti-detection capabilities
 * Compatible with Facebook, Twitter/X, Instagram, TikTok anti-bot systems
 */

class ShyMouse {
  constructor(page) {
    this.page = page;
    this.lastPos = { x: 0, y: 0 };
    this.lastMoveTime = Date.now();
    this.moveHistory = []; // Track movement patterns
    this.maxHistoryLength = 50;
    this.cachedViewport = null; // Cache viewport to reduce evaluate calls
    this.viewportCacheTime = 0;

    // Enhanced configuration with realistic human parameters
    this.config = {
      // Fatigue simulation (humans slow down over time)
      fatigueEnabled: true,
      fatigueThreshold: 20, // Actions before fatigue kicks in
      actionCount: 0,

      // Attention span (humans make mistakes)
      attentionSpan: Math.random() * 0.15 + 0.85, // 85-100% accuracy

      // Response time variability
      baseReactionTime: 180, // ms
      reactionTimeVariance: 120, // ±120ms
    };
  }

  /**
   * Get viewport dimensions with caching to reduce evaluate calls
   */
  async getViewport() {
    const now = Date.now();

    // Cache viewport for 5 minutes (viewport rarely changes)
    if (this.cachedViewport && (now - this.viewportCacheTime) < 300000) {
      return this.cachedViewport;
    }

    try {
      const viewport = await this.page.evaluate(() => {
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX || window.pageXOffset,
          scrollY: window.scrollY || window.pageYOffset
        };
      });

      this.cachedViewport = viewport;
      this.viewportCacheTime = now;

      return viewport;
    } catch (error) {
      // Fallback to default viewport if evaluate fails
      console.warn('Failed to get viewport, using fallback:', error.message);
      return {
        width: 1920,
        height: 1080,
        scrollX: 0,
        scrollY: 0
      };
    }
  }

  /**
   * Invalidate viewport cache (call after page navigation or resize)
   */
  invalidateViewportCache() {
    this.cachedViewport = null;
    this.viewportCacheTime = 0;
  }

  /**
   * Enhanced viewport visibility check with partial visibility support
   */
  async isElementInViewport(element, buffer = 10) {
    try {
      const box = await element.boundingBox();
      if (!box) return false;

      const viewport = await this.getViewport();

      const viewTop = viewport.scrollY - buffer;
      const viewBottom = viewport.scrollY + viewport.height + buffer;
      const viewLeft = viewport.scrollX - buffer;
      const viewRight = viewport.scrollX + viewport.width + buffer;

      // Check both vertical and horizontal visibility
      const verticallyVisible = (box.y < viewBottom && box.y + box.height > viewTop);
      const horizontallyVisible = (box.x < viewRight && box.x + box.width > viewLeft);

      return verticallyVisible && horizontallyVisible;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current scroll position
   */
  async getCurrentScrollY() {
    try {
      return await this.page.evaluate(() => window.scrollY || window.pageYOffset || 0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get current scroll position (X and Y)
   */
  async getCurrentScroll() {
    try {
      return await this.page.evaluate(() => ({
        x: window.scrollX || window.pageXOffset || 0,
        y: window.scrollY || window.pageYOffset || 0
      }));
    } catch (error) {
      return { x: 0, y: 0 };
    }
  }

  /**
   * Enhanced scroll simulation with human-like patterns
   */
  async scrollToElement(element, options = {}) {
    const viewport = await this.getViewport();

    if (await this.isElementInViewport(element, options.visibilityBuffer ?? 50)) {
      // Add micro-scroll even if visible (humans adjust)
      if (Math.random() < 0.3) {
        const microScroll = this.randomGaussian(0, 15);
        await this.page.mouse.wheel(0, microScroll);
        await this.randomDelay(50, 150);
      }
      return;
    }

    const box = await element.boundingBox();
    if (!box) throw new Error('Element has no bounding box');

    const targetPosition = options.targetPosition ?? 'center';
    const scrollY = await this.getCurrentScrollY();

    let targetScrollY;

    switch (targetPosition) {
      case 'top':
        targetScrollY = box.y - (options.offset ?? 100);
        break;
      case 'bottom':
        targetScrollY = box.y + box.height - viewport.height + (options.offset ?? 100);
        break;
      default: // center
        targetScrollY = box.y + box.height / 2 - viewport.height / 2;
    }

    targetScrollY = Math.max(0, targetScrollY);

    // Pre-scroll mouse movement (humans position mouse before scrolling)
    await this.preScrollMouseMovement(viewport, options);

    let remainingDelta = Math.abs(targetScrollY - scrollY);
    const direction = targetScrollY > scrollY ? 1 : -1;

    // Enhanced Fitts's Law for scrolling
    const scrollID = Math.log2(remainingDelta / 100 + 1);
    const baseSteps = Math.max(5, Math.round(8 * scrollID));
    const numSteps = this.applyFatigue(baseSteps);

    // Overshoot probability with distance consideration
    const overshootProb = options.overshootProb ?? 0.2;
    const shouldOvershoot = remainingDelta > 200 &&
                            Math.random() < overshootProb &&
                            this.config.attentionSpan < 0.95;

    let overshootAmount = 0;
    if (shouldOvershoot) {
      overshootAmount = this.randomGaussian(0.15, 0.08) * viewport.height;
      overshootAmount = this.clamp(overshootAmount, 50, viewport.height * 0.4);
    }

    // Main scroll sequence with natural acceleration/deceleration
    await this.executeScrollSequence(
      targetScrollY,
      direction,
      numSteps,
      overshootAmount,
      options
    );

    // Correction scroll if overshot
    if (overshootAmount > 0) {
      await this.randomDelay(100, 300); // Pause before correction (reaction time)
      await this.executeCorrectionScroll(
        targetScrollY,
        direction,
        numSteps,
        options
      );
    }

    // Final micro-adjustment (humans fine-tune position)
    await this.finalScrollAdjustment(element, box);

    this.updateActionCount();
  }

  /**
   * Pre-scroll mouse positioning (realistic human behavior)
   */
  async preScrollMouseMovement(viewport, options) {
    const hoverTarget = {
      x: viewport.width * (0.3 + Math.random() * 0.4), // Center-ish area
      y: viewport.height * (0.2 + Math.random() * 0.6)
    };

    const distance = this.calculateDistance(this.lastPos, hoverTarget);

    if (distance > 50) { // Only move if far from good scrolling position
      await this.moveToPosition(hoverTarget.x, hoverTarget.y, {
        ...options,
        numPoints: Math.max(8, Math.round(distance / 50)) // Quick movement
      });
    }
  }

  /**
   * Execute main scroll sequence with realistic patterns
   */
  async executeScrollSequence(targetScrollY, direction, numSteps, overshootAmount, options) {
    const jitterStdDev = options.scrollJitterStdDev ?? 20;
    let cumulativeT = 0;

    for (let i = 1; i <= numSteps; i++) {
      const currentScrollY = await this.getCurrentScrollY();
      const remainingDelta = Math.abs(targetScrollY - currentScrollY);

      if (remainingDelta < 10) break;

      const linearT = i / numSteps;
      const easedT = this.easeInOutCubic(linearT);
      const stepFraction = easedT - cumulativeT;
      cumulativeT = easedT;

      let stepDelta = stepFraction * remainingDelta;

      // Natural jitter with distance-based variance
      const distanceBasedJitter = Math.min(jitterStdDev, remainingDelta * 0.1);
      stepDelta += this.randomGaussian(0, distanceBasedJitter);

      // Realistic wheel delta bounds (mice have limits)
      stepDelta = this.clamp(stepDelta, 10, 200);

      // Add overshoot to final steps
      if (overshootAmount > 0 && i > numSteps * 0.7) {
        const overshootFraction = (i - numSteps * 0.7) / (numSteps * 0.3);
        stepDelta += overshootAmount * overshootFraction * 0.5;
      }

      await this.page.mouse.wheel(0, direction * stepDelta);

      // Variable delay with micro-pauses (humans don't scroll perfectly smoothly)
      const baseDelay = 20 + Math.random() * 80;
      const microPause = Math.random() < 0.15 ? Math.random() * 100 : 0; // 15% chance of brief pause
      await this.randomDelay(baseDelay, baseDelay + microPause);

      // Occasional micro mouse movement during scroll (natural behavior)
      if (Math.random() < 0.2) {
        await this.microMouseAdjustment();
      }
    }
  }

  /**
   * Correction scroll after overshoot
   */
  async executeCorrectionScroll(targetScrollY, direction, numSteps, options) {
    const correctionSteps = Math.max(3, Math.round(numSteps / 3));
    const jitterStdDev = (options.scrollJitterStdDev ?? 20) / 2;
    let correctionCumulativeT = 0;

    for (let i = 1; i <= correctionSteps; i++) {
      const currentScrollY = await this.getCurrentScrollY();
      const correctionDelta = Math.abs(targetScrollY - currentScrollY);

      if (correctionDelta < 10) break;

      const linearT = i / correctionSteps;
      const easedT = this.easeInOutCubic(linearT);
      const stepFraction = easedT - correctionCumulativeT;
      correctionCumulativeT = easedT;

      let stepDelta = stepFraction * correctionDelta;
      stepDelta += this.randomGaussian(0, jitterStdDev);
      stepDelta = this.clamp(stepDelta, 10, 150);

      await this.page.mouse.wheel(0, -direction * stepDelta);
      await this.randomDelay(10, 70); // Faster correction
    }
  }

  /**
   * Final micro-adjustment to ensure visibility
   */
  async finalScrollAdjustment(element, box) {
    if (!await this.isElementInViewport(element, 0)) {
      const viewport = await this.getViewport();
      const finalScrollY = await this.getCurrentScrollY();
      const finalDelta = (box.y + box.height / 2 - viewport.height / 2) - finalScrollY;

      if (Math.abs(finalDelta) > 10) {
        // Split adjustment into 1-3 small scrolls (more natural)
        const adjustments = Math.ceil(Math.abs(finalDelta) / 50);
        for (let i = 0; i < adjustments; i++) {
          const partialDelta = finalDelta / adjustments;
          await this.page.mouse.wheel(0, partialDelta);
          await this.randomDelay(30, 80);
        }
      }
    }
  }

  /**
   * Enhanced click with pre-click hovering and post-click behavior
   */
  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) throw new Error('Element has no bounding box');

    const viewport = await this.getViewport();

    // Ensure element is visible with scroll
    try {
      await this.scrollToElement(element, options);
    } catch (error) {
      console.warn('Scroll to element failed, attempting click anyway:', error.message);
    }

    // Pre-click pause (human reaction time + decision time)
    await this.humanReactionDelay();

    // Calculate intelligent click target with heat-map distribution
    const clickTarget = this.calculateClickTarget(box, options);

    // Move to near target first (humans don't click immediately after long moves)
    const approachTarget = this.calculateApproachTarget(clickTarget, box);
    await this.moveToPosition(approachTarget.x, approachTarget.y, {
      ...options,
      isApproach: true
    });

    // Brief hover before click (100-400ms, humans hesitate)
    await this.randomDelay(100, 400);

    // Final micro-adjustment to exact click point
    await this.moveToPosition(clickTarget.x, clickTarget.y, {
      ...options,
      numPoints: Math.max(3, Math.round(Math.random() * 5)) // Quick final adjustment
    });

    // Click with realistic timing
    const clickDuration = Math.round(this.randomGaussian(70, 25)); // 45-95ms typical
    await this.page.mouse.down();
    await this.randomDelay(Math.max(30, clickDuration), clickDuration + 20);
    await this.page.mouse.up();

    // Post-click behavior (humans don't instantly move away)
    await this.postClickBehavior(clickTarget, viewport, options);

    this.lastPos = clickTarget;
    this.updateActionCount();
  }

  /**
   * Calculate realistic click target with preference for center mass
   */
  calculateClickTarget(box, options) {
    const clickPaddingFactor = options.clickPadding ?? 0.7; // Tighter default (more realistic)

    // Gaussian distribution centered on element center (humans click near center)
    const offsetX = this.randomGaussian(0, box.width / 4) * clickPaddingFactor;
    const offsetY = this.randomGaussian(0, box.height / 4) * clickPaddingFactor;

    let targetX = box.x + box.width / 2 + offsetX;
    let targetY = box.y + box.height / 2 + offsetY;

    // Ensure within element bounds with small margin
    const margin = 5;
    targetX = this.clamp(targetX, box.x + margin, box.x + box.width - margin);
    targetY = this.clamp(targetY, box.y + margin, box.y + box.height - margin);

    return { x: targetX, y: targetY };
  }

  /**
   * Calculate approach target (humans don't go directly to click point)
   */
  calculateApproachTarget(clickTarget, box) {
    // Approach from a point 20-50px away, roughly towards element center
    const distance = 20 + Math.random() * 30;
    const angle = Math.random() * Math.PI * 2;

    return {
      x: clickTarget.x + Math.cos(angle) * distance,
      y: clickTarget.y + Math.sin(angle) * distance
    };
  }

  /**
   * Post-click behavior simulation
   */
  async postClickBehavior(clickTarget, viewport, options) {
    const behavior = Math.random();

    if (behavior < 0.4) {
      // Stay still briefly (40% chance)
      await this.randomDelay(100, 500);
    } else if (behavior < 0.7) {
      // Small jitter movement (30% chance)
      const jitterX = clickTarget.x + this.randomGaussian(0, 8);
      const jitterY = clickTarget.y + this.randomGaussian(0, 8);

      await this.moveToPosition(
        this.clamp(jitterX, 0, viewport.width),
        this.clamp(jitterY, 0, viewport.height),
        { ...options, numPoints: 3 }
      );

      await this.randomDelay(50, 200);
    } else {
      // Move away slightly (30% chance)
      const awayDistance = 30 + Math.random() * 70;
      const awayAngle = Math.random() * Math.PI * 2;
      const awayX = clickTarget.x + Math.cos(awayAngle) * awayDistance;
      const awayY = clickTarget.y + Math.sin(awayAngle) * awayDistance;

      await this.moveToPosition(
        this.clamp(awayX, 0, viewport.width),
        this.clamp(awayY, 0, viewport.height),
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
    if (this.lastPos.x === 0 && this.lastPos.y === 0) {
      this.initializePosition(viewport);
    }

    // Generate natural target within safe bounds
    const padding = 50;
    const targetX = padding + Math.random() * (viewport.width - 2 * padding);
    const targetY = padding + Math.random() * (viewport.height - 2 * padding);

    await this.moveToPosition(targetX, targetY, options);
    this.updateActionCount();
  }

  /**
   * Core movement function with enhanced Bezier curves
   */
  async moveToPosition(targetX, targetY, options = {}) {
    const viewport = await this.getViewport();

    // Initialize if needed
    if (this.lastPos.x === 0 && this.lastPos.y === 0) {
      this.initializePosition(viewport);
    }

    const { points } = this.calculateBezierPoints(
      this.lastPos.x,
      this.lastPos.y,
      targetX,
      targetY,
      null,
      viewport,
      options
    );

    // Execute movement with realistic timing
    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      try {
        await this.page.mouse.move(point.x, point.y);
      } catch (error) {
        console.warn('Mouse move failed:', error.message);
        continue;
      }

      // Variable delay based on movement phase
      let delay;
      const phase = i / points.length;

      if (phase < 0.2) {
        // Acceleration phase - shorter delays
        delay = 5 + Math.random() * 8;
      } else if (phase > 0.8) {
        // Deceleration phase - longer delays
        delay = 8 + Math.random() * 15;
      } else {
        // Mid-movement - moderate delays
        delay = 5 + Math.random() * 12;
      }

      await this.randomDelay(delay, delay + 5);

      // Occasional micro-pause mid-movement (2% chance)
      if (Math.random() < 0.02) {
        await this.randomDelay(30, 100);
      }
    }

    this.lastPos = { x: targetX, y: targetY };
    this.lastMoveTime = Date.now();
    this.addToHistory({ x: targetX, y: targetY, time: Date.now() });
  }

  /**
   * Enhanced Bezier curve calculation with advanced human-like properties
   */
  calculateBezierPoints(startX, startY, targetX, targetY, box, viewport, options) {
    const D = this.calculateDistance({ x: startX, y: startY }, { x: targetX, y: targetY });

    // Enhanced Fitts's Law calculation
    const W = box ? Math.min(box.width, box.height) : (options.defaultTargetWidth ?? 100);
    const ID = Math.log2(D / W + 1);

    // Fatigue and attention affect number of points
    let baseNumPoints = Math.max(15, Math.round(12 * ID));
    baseNumPoints = this.applyFatigue(baseNumPoints);
    const numPoints = options.numPoints ?? baseNumPoints;

    // Calculate control points with advanced curvature
    const { p0, p1, p2, p3 } = this.calculateControlPoints(
      startX, startY, targetX, targetY, D, options
    );

    // Generate points along curve
    const jitterStdDev = options.jitterStdDev ?? 1.5;
    const points = [];

    for (let i = 1; i <= numPoints; i++) {
      const linearT = i / numPoints;
      const easedT = this.easeInOutCubic(linearT);

      let point = this.getBezierPoint(easedT, p0, p1, p2, p3);

      // Apply jitter with distance-based variance (less jitter near target)
      const distanceToEnd = (1 - easedT) * D;
      const distanceBasedJitter = jitterStdDev * Math.min(1, distanceToEnd / 100);
      point.x += this.randomGaussian(0, distanceBasedJitter);
      point.y += this.randomGaussian(0, distanceBasedJitter);

      // Apply attention-based inaccuracy
      if (this.config.attentionSpan < 0.95 && Math.random() > this.config.attentionSpan) {
        point.x += this.randomGaussian(0, 3);
        point.y += this.randomGaussian(0, 3);
      }

      // Clamp to viewport
      point.x = this.clamp(point.x, 0, viewport.width);
      point.y = this.clamp(point.y, 0, viewport.height);

      points.push(point);
    }

    // Handle overshoot for clicks
    return this.handleOvershoot(startX, startY, targetX, targetY, box, viewport, points, options, D, W);
  }

  /**
   * Calculate control points for Bezier curve with natural curvature
   */
  calculateControlPoints(startX, startY, targetX, targetY, D, options) {
    const dx = targetX - startX;
    const dy = targetY - startY;

    // Variable curvature based on distance (longer distances = more curve)
    const baseDeviation = D * (0.15 + Math.random() * 0.25); // 15-40% of distance
    const deviation = options.isApproach ? baseDeviation * 0.5 : baseDeviation; // Less curve for approach

    // Perpendicular vector for offset
    const length = Math.sqrt(dx * dx + dy * dy) || 1; // Prevent division by zero
    const perpX = -dy / length;
    const perpY = dx / length;

    // Random curve direction
    const randomSign = Math.random() < 0.5 ? -1 : 1;

    // Control points with variable positioning
    const c1Factor = 0.25 + Math.random() * 0.15; // 0.25-0.40
    const c2Factor = 0.60 + Math.random() * 0.15; // 0.60-0.75

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
   * Handle overshoot and correction for realistic targeting
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

    // Calculate overshoot
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / length;
    const dirY = dy / length;

    const overshootFactor = 0.1 + Math.random() * 0.2; // 10-30%
    const overshootDist = overshootFactor * W;

    const overshootX = targetX + dirX * overshootDist;
    const overshootY = targetY + dirY * overshootDist;

    // Generate overshoot path
    const overshootResult = this.calculateBezierPoints(
      startX, startY, overshootX, overshootY, box, viewport,
      { ...options, overshootProb: 0 } // Prevent recursive overshoot
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
   * Generate correction path after overshoot
   */
  generateCorrectionPath(overshootX, overshootY, targetX, targetY, viewport, options) {
    const correctionD = this.calculateDistance(
      { x: overshootX, y: overshootY },
      { x: targetX, y: targetY }
    );

    const correctionNumPoints = Math.max(5, Math.round(correctionD / 10)); // Denser points for precision
    const jitterStdDev = (options.jitterStdDev ?? 1.5) / 2; // Less jitter in correction

    const dx = targetX - overshootX;
    const dy = targetY - overshootY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    // Smaller curve for correction
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

      point.x = this.clamp(point.x, 0, viewport.width);
      point.y = this.clamp(point.y, 0, viewport.height);

      correctionPoints.push(point);
    }

    return correctionPoints;
  }

  /**
   * Micro mouse adjustment during scrolling
   */
  async microMouseAdjustment() {
    const currentPos = this.lastPos;
    const microX = currentPos.x + this.randomGaussian(0, 3);
    const microY = currentPos.y + this.randomGaussian(0, 3);

    const viewport = await this.getViewport();

    try {
      await this.page.mouse.move(
        this.clamp(microX, 0, viewport.width),
        this.clamp(microY, 0, viewport.height)
      );
    } catch (error) {
      // Silently fail for micro-adjustments
    }
  }

  /**
   * Calculate point on cubic Bezier curve
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
   * Enhanced easing function with slight randomization
   */
  easeInOutCubic(t) {
    // Add tiny random variance to easing (humans aren't perfectly smooth)
    const variance = (Math.random() - 0.5) * 0.02; // ±1%
    t = this.clamp(t + variance, 0, 1);

    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Gaussian random number generator (Box-Muller transform)
   */
  randomGaussian(mean = 0, stdDev = 1) {
    const u = 1 - Math.random(); // Uniform(0,1] - avoiding 0
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  /**
   * Human reaction delay simulation
   */
  async humanReactionDelay() {
    const baseTime = this.config.baseReactionTime;
    const variance = this.config.reactionTimeVariance;
    const reactionTime = Math.max(80, this.randomGaussian(baseTime, variance));

    await this.randomDelay(reactionTime * 0.8, reactionTime * 1.2);
  }

  /**
   * Random delay helper
   */
  async randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Calculate Euclidean distance
   */
  calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clamp value between min and max
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Initialize mouse position naturally
   */
  initializePosition(viewport) {
    const x = viewport.width * (0.3 + Math.random() * 0.4);
    const y = viewport.height * (0.3 + Math.random() * 0.4);

    this.lastPos = { x, y };
    this.lastMoveTime = Date.now();
  }

  /**
   * Apply fatigue effect to movement
   */
  applyFatigue(baseValue) {
    if (!this.config.fatigueEnabled) return baseValue;

    if (this.config.actionCount > this.config.fatigueThreshold) {
      const fatigueMultiplier = 1 + (this.config.actionCount - this.config.fatigueThreshold) * 0.02;
      return Math.round(baseValue * Math.min(fatigueMultiplier, 1.5)); // Max 50% slowdown
    }

    return baseValue;
  }

  /**
   * Update action count and simulate attention recovery
   */
  updateActionCount() {
    this.config.actionCount++;

    // Periodic "rest" resets fatigue
    if (this.config.actionCount % 50 === 0) {
      this.config.actionCount = Math.max(0, this.config.actionCount - 20);
      this.config.attentionSpan = Math.min(1, this.config.attentionSpan + 0.05);
    }

    // Gradually decrease attention span
    this.config.attentionSpan = Math.max(0.85, this.config.attentionSpan - 0.001);
  }

  /**
   * Add movement to history for pattern analysis
   */
  addToHistory(position) {
    this.moveHistory.push(position);

    if (this.moveHistory.length > this.maxHistoryLength) {
      this.moveHistory.shift();
    }
  }

  /**
   * Get movement statistics (for debugging/analysis)
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
   * Reset state (useful for long-running sessions)
   */
  reset() {
    this.config.actionCount = 0;
    this.config.attentionSpan = Math.random() * 0.15 + 0.85;
    this.moveHistory = [];
    this.invalidateViewportCache();
  }
}

module.exports = ShyMouse;