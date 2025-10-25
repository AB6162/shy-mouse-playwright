class ShyMouse {
  constructor(page, options = {}) {
    this.page = page;
    this.lastPos = null;
    this.lastMoveTime = Date.now();
    this.moveHistory = [];
    this.maxHistoryLength = 50;
    this.cachedViewport = null;
    this.viewportCacheTime = 0;
    this.viewportCacheDuration = 2000;

    // Research-based configuration
    this.config = {
      // Fatigue system (coherent: everything slows down)
      fatigueEnabled: options.fatigueEnabled ?? true,
      fatigueThreshold: options.fatigueThreshold ?? 20,
      actionCount: 0,
      maxFatigue: options.maxFatigue ?? 100,
      fatigueMultiplier: 1.0, // Affects both speed and precision coherently

      attentionSpan: 0.88 + Math.random() * 0.10,
      minAttentionSpan: 0.80,

      // Human reaction time: 150-300ms (research-based)
      baseReactionTime: options.baseReactionTime ?? 200,
      reactionTimeVariance: options.reactionTimeVariance ?? 80,

      curveComplexity: options.curveComplexity ?? 'high',
      debug: options.debug ?? false,

      // Human behavior patterns
      hesitationProbability: 0.08,
      microCorrectionFrequency: 0.15,
      targetDriftEnabled: true,

      // Mouse polling rate simulation (60-144Hz typical)
      minPollingInterval: 6.9, // 144Hz
      maxPollingInterval: 16.6, // 60Hz
      typicalPollingInterval: 10, // ~100Hz (most common)
    };

    this.setupNavigationListener();
    this.setupConsoleLogger();
  }

  /**
   * Setup navigation listener
   */
  setupNavigationListener() {
    try {
      this.page.on('framenavigated', () => {
        this.invalidateViewportCache();
        this.log('Frame navigated');
      });
    } catch (error) {
      this.log('Navigation listener failed:', error.message);
    }
  }

  /**
   * Setup console logger
   */
  setupConsoleLogger() {
    if (this.config.debug) {
      try {
        this.page.on('console', msg => {
          console.log('[Page]', msg.type(), msg.text());
        });
      } catch (error) {
        // Silent
      }
    }
  }

  /**
   * Log
   */
  log(...args) {
    if (this.config.debug) {
      console.log('[ShyMouse]', new Date().toISOString().substr(11, 12), ...args);
    }
  }

  /**
   * Get viewport with retry
   */
  async getViewport(retries = 2) {
    const now = Date.now();

    if (this.cachedViewport && (now - this.viewportCacheTime) < this.viewportCacheDuration) {
      return this.cachedViewport;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const viewportInfo = await this.page.evaluate(() => {
          try {
            return {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX || window.pageXOffset || 0,
              scrollY: window.scrollY || window.pageYOffset || 0,
              devicePixelRatio: window.devicePixelRatio || 1,
              documentWidth: Math.max(
                document.documentElement.scrollWidth || 0,
                document.documentElement.offsetWidth || 0,
                document.documentElement.clientWidth || 0,
                document.body?.scrollWidth || 0,
                document.body?.offsetWidth || 0
              ),
              documentHeight: Math.max(
                document.documentElement.scrollHeight || 0,
                document.documentElement.offsetHeight || 0,
                document.documentElement.clientHeight || 0,
                document.body?.scrollHeight || 0,
                document.body?.offsetHeight || 0
              ),
            };
          } catch (e) {
            return null;
          }
        });

        if (viewportInfo) {
          this.cachedViewport = viewportInfo;
          this.viewportCacheTime = now;
          return viewportInfo;
        }

        if (attempt < retries) {
          await this.randomDelay(50, 100);
        }
      } catch (error) {
        this.log(`getViewport attempt ${attempt + 1} failed:`, error.message);
        if (attempt < retries) {
          await this.randomDelay(100, 200);
        }
      }
    }

    this.log('Using fallback viewport');
    const fallback = {
      width: 1920,
      height: 1080,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
      documentWidth: 1920,
      documentHeight: 1080,
    };

    this.cachedViewport = fallback;
    this.viewportCacheTime = now - (this.viewportCacheDuration - 500);

    return fallback;
  }

  /**
   * Invalidate cache
   */
  invalidateViewportCache() {
    this.cachedViewport = null;
    this.viewportCacheTime = 0;
  }

  /**
   * Get element frame
   */
  async getElementFrame(element) {
    try {
      const frame = await element.ownerFrame();
      return frame || this.page.mainFrame();
    } catch (error) {
      this.log('getElementFrame failed:', error.message);
      return this.page.mainFrame();
    }
  }

  /**
   * Get scroll container using evaluateHandle (no DOM injection)
   */
  async getScrollContainer(element) {
    try {
      // Use evaluateHandle to get container reference without DOM modification
      const containerHandle = await element.evaluateHandle(el => {
        try {
          let parent = el.parentElement;
          let depth = 0;

          while (parent && parent !== document.documentElement && depth < 50) {
            const style = window.getComputedStyle(parent);
            const overflow = style.overflow + style.overflowY + style.overflowX;

            if (/(auto|scroll)/.test(overflow)) {
              return parent;
            }

            parent = parent.parentElement;
            depth++;
          }

          return null; // Window scroll
        } catch (e) {
          return null;
        }
      });

      // Check if we got a valid container
      const isContainer = await containerHandle.evaluate(node => node !== null);

      if (isContainer) {
        // Get container info
        const containerInfo = await containerHandle.evaluate(container => {
          try {
            const rect = container.getBoundingClientRect();
            return {
              isWindow: false,
              scrollTop: container.scrollTop,
              scrollLeft: container.scrollLeft,
              scrollHeight: container.scrollHeight,
              scrollWidth: container.scrollWidth,
              clientHeight: container.clientHeight,
              clientWidth: container.clientWidth,
              rectTop: rect.top,
              rectLeft: rect.left,
              rectWidth: rect.width,
              rectHeight: rect.height,
            };
          } catch (e) {
            return null;
          }
        });

        if (containerInfo) {
          return {
            info: containerInfo,
            containerHandle: containerHandle
          };
        }
      }

      // Dispose handle if not used
      await containerHandle.dispose();

      // Window scroll fallback
      const viewport = await this.getViewport();
      return {
        info: {
          isWindow: true,
          scrollTop: viewport.scrollY,
          scrollLeft: viewport.scrollX,
          scrollHeight: viewport.documentHeight,
          scrollWidth: viewport.documentWidth,
          clientHeight: viewport.height,
          clientWidth: viewport.width,
        },
        containerHandle: null
      };
    } catch (error) {
      this.log('getScrollContainer failed:', error.message);
      const viewport = await this.getViewport();
      return {
        info: {
          isWindow: true,
          scrollTop: viewport.scrollY,
          scrollLeft: viewport.scrollX,
          scrollHeight: viewport.documentHeight,
          scrollWidth: viewport.documentWidth,
          clientHeight: viewport.height,
          clientWidth: viewport.width,
        },
        containerHandle: null
      };
    }
  }

  /**
   * Enhanced clickability check with multi-point sampling and ancestor checking
   */
  async isElementClickable(element) {
    try {
      return await element.evaluate(el => {
        try {
          if (!el.isConnected) return false;

          const style = window.getComputedStyle(el);

          if (style.display === 'none') return false;
          if (style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity) < 0.1) return false;

          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;

          if (rect.bottom < 0 || rect.right < 0) return false;
          if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false;

          if (style.pointerEvents === 'none') return false;
          if (el.disabled) return false;

          // Check pointer-events on ancestors
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== document.body) {
            const ancestorStyle = window.getComputedStyle(ancestor);
            if (ancestorStyle.pointerEvents === 'none') return false;
            ancestor = ancestor.parentElement;
          }

          // Multi-point sampling (center + 4 cardinal points + 4 corners)
          const samplingPoints = [
            { x: 0.5, y: 0.5 }, // Center
            { x: 0.3, y: 0.5 }, // Left
            { x: 0.7, y: 0.5 }, // Right
            { x: 0.5, y: 0.3 }, // Top
            { x: 0.5, y: 0.7 }, // Bottom
            { x: 0.3, y: 0.3 }, // Top-left
            { x: 0.7, y: 0.3 }, // Top-right
            { x: 0.3, y: 0.7 }, // Bottom-left
            { x: 0.7, y: 0.7 }, // Bottom-right
          ];

          let clickablePoints = 0;

          for (const point of samplingPoints) {
            const x = rect.left + rect.width * point.x;
            const y = rect.top + rect.height * point.y;

            const topElement = document.elementFromPoint(x, y);

            if (topElement) {
              if (topElement === el || el.contains(topElement)) {
                clickablePoints++;
              } else {
                // Check if element is ancestor of topElement
                let current = topElement;
                while (current && current !== document.body) {
                  if (current === el) {
                    clickablePoints++;
                    break;
                  }
                  current = current.parentElement;
                }
              }
            }
          }

          // At least 50% of sample points must be clickable
          return clickablePoints >= samplingPoints.length * 0.5;
        } catch (e) {
          return false;
        }
      });
    } catch (error) {
      this.log('isElementClickable failed:', error.message);
      return false;
    }
  }

  /**
   * Check if in viewport
   */
  async isElementInViewport(element, buffer = 10) {
    try {
      const box = await this.getElementBoundingBox(element);
      if (!box) return false;

      const scrollContainer = await this.getScrollContainer(element);
      const viewport = await this.getViewport();

      if (scrollContainer.info.isWindow) {
        const viewTop = viewport.scrollY - buffer;
        const viewBottom = viewport.scrollY + viewport.height + buffer;
        const viewLeft = viewport.scrollX - buffer;
        const viewRight = viewport.scrollX + viewport.width + buffer;

        const hasVerticalOverlap = !(box.y + box.height < viewTop || box.y > viewBottom);
        const hasHorizontalOverlap = !(box.x + box.width < viewLeft || box.x > viewRight);

        return hasVerticalOverlap && hasHorizontalOverlap;
      } else {
        const inContainer = await element.evaluate((el, buff) => {
          try {
            let parent = el.parentElement;

            while (parent && parent !== document.documentElement) {
              const style = window.getComputedStyle(parent);
              const overflow = style.overflow + style.overflowY + style.overflowX;

              if (/(auto|scroll)/.test(overflow)) {
                const parentRect = parent.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();

                const hasVerticalOverlap = !(elRect.bottom < parentRect.top - buff || elRect.top > parentRect.bottom + buff);
                const hasHorizontalOverlap = !(elRect.right < parentRect.left - buff || elRect.left > parentRect.right + buff);

                return hasVerticalOverlap && hasHorizontalOverlap;
              }

              parent = parent.parentElement;
            }

            return true;
          } catch (e) {
            return false;
          }
        }, buffer);

        // Dispose container handle if exists
        if (scrollContainer.containerHandle) {
          await scrollContainer.containerHandle.dispose().catch(() => {});
        }

        return inContainer;
      }
    } catch (error) {
      this.log('isElementInViewport failed:', error.message);
      return false;
    }
  }

  /**
   * Get bounding box
   */
  async getElementBoundingBox(element, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const box = await element.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          return box;
        }

        if (attempt < maxRetries - 1) {
          await this.randomDelay(50, 150);
        }
      } catch (error) {
        if (attempt === maxRetries - 1) {
          this.log(`Failed to get bounding box after ${maxRetries} attempts:`, error.message);
          return null;
        }
        await this.randomDelay(100, 200);
      }
    }
    return null;
  }

  /**
   * Wait for element stability with RAF + timeout (no hanging)
   */
  async waitForElementStability(element, timeout = 1500) {
    const startTime = Date.now();

    // Check for animations
    try {
      const hasAnimations = await element.evaluate(el => {
        try {
          const style = window.getComputedStyle(el);
          const hasTransition = style.transition !== 'all 0s ease 0s' && style.transition !== 'none';
          const hasAnimation = style.animation !== 'none';
          return hasTransition || hasAnimation;
        } catch (e) {
          return false;
        }
      });

      if (hasAnimations) {
        await this.randomDelay(300, 500);
      }
    } catch (error) {
      // Continue
    }

    // RAF-based stability check with guaranteed timeout
    const stabilityPromise = element.evaluate((el, timeoutMs) => {
      return new Promise((resolve) => {
        try {
          let lastChangeTime = Date.now();
          const startTime = Date.now();
          const requiredStableTime = 150; // ms of no changes
          let frameCount = 0;

          const observer = new MutationObserver(() => {
            lastChangeTime = Date.now();
          });

          observer.observe(el, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true
          });

          const checkStability = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const timeSinceChange = now - lastChangeTime;

            // Timeout exceeded
            if (elapsed > timeoutMs) {
              observer.disconnect();
              resolve(false);
              return;
            }

            // Stable for required time
            if (timeSinceChange >= requiredStableTime) {
              observer.disconnect();
              resolve(true);
              return;
            }

            frameCount++;
            requestAnimationFrame(checkStability);
          };

          requestAnimationFrame(checkStability);
        } catch (e) {
          resolve(false);
        }
      });
    }, timeout);

    // Race with timeout
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), timeout));
    const isStable = await Promise.race([stabilityPromise, timeoutPromise]);

    if (!isStable) {
      this.log('Stability check timed out or element unstable');
    }

    // Position stability check
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
          const widthDiff = Math.abs(box.width - lastBox.width);
          const heightDiff = Math.abs(box.height - lastBox.height);

          if (xDiff < 1 && yDiff < 1 && widthDiff < 1 && heightDiff < 1) {
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

    return lastBox;
  }

  /**
   * Get scroll Y
   */
  async getCurrentScrollY() {
    try {
      return await this.page.evaluate(() => {
        try {
          return window.scrollY || window.pageYOffset || 0;
        } catch (e) {
          return 0;
        }
      });
    } catch (error) {
      return 0;
    }
  }

  /**
   * Scroll to element with coherent fatigue
   */
  async scrollToElement(element, options = {}) {
    const viewport = await this.getViewport();

    if (await this.isElementInViewport(element, options.visibilityBuffer ?? 50)) {
      if (Math.random() < 0.25) {
        const microScroll = this.randomGaussian(0, 12);
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

    if (scrollContainer.info.isWindow) {
      currentScroll = viewport.scrollY;

      switch (targetPosition) {
        case 'top':
          targetScroll = box.y - (options.offset ?? 100);
          break;
        case 'bottom':
          targetScroll = box.y + box.height - viewport.height + (options.offset ?? 100);
          break;
        default:
          targetScroll = box.y + box.height / 2 - viewport.height / 2;
      }

      const maxScroll = scrollContainer.info.scrollHeight - viewport.height;
      targetScroll = this.clamp(targetScroll, 0, maxScroll);
    } else {
      const scrollInfo = await element.evaluate((el, opts) => {
        try {
          let parent = el.parentElement;

          while (parent && parent !== document.documentElement) {
            const style = window.getComputedStyle(parent);
            const overflow = style.overflow + style.overflowY + style.overflowX;

            if (/(auto|scroll)/.test(overflow)) {
              const parentRect = parent.getBoundingClientRect();
              const elRect = el.getBoundingClientRect();

              const currentScrollTop = parent.scrollTop;
              const targetPos = opts.targetPosition || 'center';

              const elTopRelativeToContainer = elRect.top - parentRect.top + currentScrollTop;

              let scrollTo;
              if (targetPos === 'top') {
                scrollTo = elTopRelativeToContainer - (opts.offset || 50);
              } else if (targetPos === 'bottom') {
                scrollTo = elTopRelativeToContainer + elRect.height - parent.clientHeight + (opts.offset || 50);
              } else {
                scrollTo = elTopRelativeToContainer - parent.clientHeight / 2 + elRect.height / 2;
              }

              const maxScroll = parent.scrollHeight - parent.clientHeight;
              scrollTo = Math.max(0, Math.min(scrollTo, maxScroll));

              return {
                found: true,
                currentScroll: currentScrollTop,
                targetScroll: scrollTo,
                maxScroll: maxScroll
              };
            }

            parent = parent.parentElement;
          }

          return { found: false };
        } catch (e) {
          return { found: false };
        }
      }, { targetPosition, offset: options.offset });

      if (scrollInfo.found) {
        currentScroll = scrollInfo.currentScroll;
        targetScroll = scrollInfo.targetScroll;
      } else {
        currentScroll = viewport.scrollY;
        targetScroll = box.y + box.height / 2 - viewport.height / 2;
        targetScroll = this.clamp(targetScroll, 0, scrollContainer.info.scrollHeight - viewport.height);
      }
    }

    await this.preScrollMouseMovement(viewport, options);

    const delta = Math.abs(targetScroll - currentScroll);
    if (delta < 10) {
      // Dispose container handle
      if (scrollContainer.containerHandle) {
        await scrollContainer.containerHandle.dispose().catch(() => {});
      }
      return;
    }

    const direction = targetScroll > currentScroll ? 1 : -1;

    const scrollID = Math.log2(delta / 100 + 1);
    const baseSteps = Math.max(5, Math.round(8 * scrollID));
    const numSteps = this.applyFatigue(baseSteps);

    const overshootProb = options.overshootProb ?? 0.18;
    const shouldOvershoot = delta > 250 &&
                            Math.random() < overshootProb &&
                            this.config.attentionSpan < 0.94;

    let overshootAmount = 0;
    if (shouldOvershoot) {
      overshootAmount = this.randomGaussian(0.15, 0.07) * viewport.height;
      overshootAmount = this.clamp(overshootAmount, 40, viewport.height * 0.35);
    }

    await this.executeScrollSequence(
      targetScroll,
      direction,
      numSteps,
      overshootAmount,
      scrollContainer,
      options
    );

    if (overshootAmount > 0) {
      await this.randomDelay(120, 350);
      await this.executeCorrectionScrollLogarithmic(
        targetScroll,
        direction,
        Math.max(3, Math.round(numSteps / 3)),
        scrollContainer,
        options
      );
    }

    // Dispose container handle
    if (scrollContainer.containerHandle) {
      await scrollContainer.containerHandle.dispose().catch(() => {});
    }

    await this.randomDelay(80, 180);
    this.updateActionCount();
  }

  /**
   * Pre-scroll mouse
   */
  async preScrollMouseMovement(viewport, options) {
    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    const hoverTarget = {
      x: viewport.width * (0.25 + Math.random() * 0.5),
      y: viewport.height * (0.15 + Math.random() * 0.7)
    };

    const distance = this.calculateDistance(this.lastPos, hoverTarget);

    if (distance > 60) {
      await this.moveToPosition(hoverTarget.x, hoverTarget.y, {
        ...options,
        numPoints: Math.max(6, Math.round(distance / 60))
      });
    }
  }

  /**
   * Execute scroll with COHERENT fatigue (smaller steps, slower)
   */
  async executeScrollSequence(targetScroll, direction, numSteps, overshootAmount, scrollContainer, options) {
    const baseJitterStdDev = options.scrollJitterStdDev ?? 18;
    const jitterStdDev = baseJitterStdDev * this.config.fatigueMultiplier; // Fatigue increases jitter

    for (let i = 1; i <= numSteps; i++) {
      let currentScroll;

      if (scrollContainer.info.isWindow) {
        currentScroll = await this.getCurrentScrollY();
      } else if (scrollContainer.containerHandle) {
        currentScroll = await scrollContainer.containerHandle.evaluate(el => {
          try {
            return el.scrollTop;
          } catch (e) {
            return 0;
          }
        });
      } else {
        break;
      }

      const remainingDelta = Math.abs(targetScroll - currentScroll);
      if (remainingDelta < 8) break;

      const progress = i / numSteps;

      // Logarithmic deceleration
      const logDeceleration = 1 - Math.log10(1 + 9 * progress);
      const easedProgress = this.easeInOutCubic(progress);
      const blendedProgress = easedProgress * 0.6 + logDeceleration * 0.4;

      // COHERENT FATIGUE: smaller steps (divide by fatigue)
      let stepDelta = (remainingDelta * (1 - blendedProgress) * 0.3) / this.config.fatigueMultiplier;

      const distanceBasedJitter = Math.min(jitterStdDev, remainingDelta * 0.12);
      stepDelta += this.randomGaussian(0, distanceBasedJitter);

      stepDelta = this.clamp(stepDelta, 8, 180);

      if (overshootAmount > 0 && i > numSteps * 0.75) {
        const overshootFraction = (i - numSteps * 0.75) / (numSteps * 0.25);
        stepDelta += overshootAmount * overshootFraction * 0.4;
      }

      if (scrollContainer.info.isWindow) {
        await this.page.mouse.wheel(0, direction * stepDelta);
      } else if (scrollContainer.containerHandle) {
        await scrollContainer.containerHandle.evaluate((el, delta) => {
          try {
            el.scrollTop += delta;
          } catch (e) {
            // Silent
          }
        }, direction * stepDelta);
      }

      // COHERENT FATIGUE: slower delays (multiply by fatigue)
      const baseDelay = (18 + Math.random() * 75) * this.config.fatigueMultiplier;
      const microPause = Math.random() < 0.12 ? Math.random() * 90 : 0;
      await this.randomDelay(baseDelay, baseDelay + microPause);

      if (Math.random() < 0.18) {
        await this.microMouseAdjustment();
      }
    }
  }

  /**
   * Correction scroll
   */
  async executeCorrectionScrollLogarithmic(targetScroll, direction, correctionSteps, scrollContainer, options) {
    const baseJitterStdDev = (options.scrollJitterStdDev ?? 18) / 2;
    const jitterStdDev = baseJitterStdDev * this.config.fatigueMultiplier;

    for (let i = 1; i <= correctionSteps; i++) {
      let currentScroll;

      if (scrollContainer.info.isWindow) {
        currentScroll = await this.getCurrentScrollY();
      } else if (scrollContainer.containerHandle) {
        currentScroll = await scrollContainer.containerHandle.evaluate(el => {
          try {
            return el.scrollTop;
          } catch (e) {
            return 0;
          }
        });
      } else {
        break;
      }

      const correctionDelta = Math.abs(targetScroll - currentScroll);
      if (correctionDelta < 8) break;

      const progress = i / correctionSteps;
      const logFactor = 1 - Math.log10(1 + 9 * progress);

      // COHERENT FATIGUE
      let stepDelta = (correctionDelta * logFactor * 0.4) / this.config.fatigueMultiplier;

      stepDelta += this.randomGaussian(0, jitterStdDev);
      stepDelta = this.clamp(stepDelta, 8, 130);

      if (scrollContainer.info.isWindow) {
        await this.page.mouse.wheel(0, -direction * stepDelta);
      } else if (scrollContainer.containerHandle) {
        await scrollContainer.containerHandle.evaluate((el, delta) => {
          try {
            el.scrollTop += delta;
          } catch (e) {
            // Silent
          }
        }, -direction * stepDelta);
      }

      await this.randomDelay(12 * this.config.fatigueMultiplier, 65 * this.config.fatigueMultiplier);
    }
  }

  /**
   * Enhanced click
   */
  async click(element, options = {}) {
    const maxWaitTime = options.waitTimeout ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (await this.isElementClickable(element)) {
        break;
      }
      await this.randomDelay(80, 180);
    }

    if (!await this.isElementClickable(element)) {
      throw new Error('Element is not clickable');
    }

    const stableBox = await this.waitForElementStability(element, options.stabilityTimeout ?? 1500);
    if (!stableBox) {
      throw new Error('Element position is unstable');
    }

    const viewport = await this.getViewport();

    try {
      await this.scrollToElement(element, options);
    } catch (error) {
      this.log('Scroll failed:', error.message);
    }

    await this.randomDelay(120, 250);

    const box = await this.getElementBoundingBox(element);
    if (!box) {
      throw new Error('Element bounding box unavailable');
    }

    await this.humanReactionDelay();

    const clickTarget = this.calculateClickTarget(box, options);
    clickTarget.x = this.clamp(clickTarget.x, 0, viewport.width - 1);
    clickTarget.y = this.clamp(clickTarget.y, 0, viewport.height - 1);

    // NATURAL APPROACH: based on current trajectory
    const approachTarget = this.calculateNaturalApproachTarget(clickTarget, box, viewport);

    await this.moveToPosition(approachTarget.x, approachTarget.y, {
      ...options,
      isApproach: true
    });

    await this.randomDelay(120, 450);

    await this.moveToPosition(clickTarget.x, clickTarget.y, {
      ...options,
      numPoints: Math.max(3, Math.round(2 + Math.random() * 4))
    });

    if (!await this.isElementClickable(element)) {
      throw new Error('Element became unclickable');
    }

    // Pre-click state
    const preClickState = await element.evaluate(el => {
      try {
        return {
          className: el.className,
          disabled: el.disabled,
          ariaPressed: el.getAttribute('aria-pressed'),
          ariaExpanded: el.getAttribute('aria-expanded'),
        };
      } catch (e) {
        return null;
      }
    });

    // REALISTIC CLICK DURATION: 40-120ms (research-based)
    const clickDuration = Math.max(40, Math.round(this.randomGaussian(75, 20)));

    try {
      await this.page.mouse.down();
      await this.randomDelay(clickDuration, clickDuration + 15);
      await this.page.mouse.up();
    } catch (error) {
      throw new Error(`Click failed: ${error.message}`);
    }

    // Validate click
    if (options.validateClick !== false && preClickState) {
      await this.randomDelay(50, 150);

      const postClickState = await element.evaluate(el => {
        try {
          return {
            className: el.className,
            disabled: el.disabled,
            ariaPressed: el.getAttribute('aria-pressed'),
            ariaExpanded: el.getAttribute('aria-expanded'),
          };
        } catch (e) {
          return null;
        }
      });

      if (postClickState) {
        const stateChanged =
          preClickState.className !== postClickState.className ||
          preClickState.disabled !== postClickState.disabled ||
          preClickState.ariaPressed !== postClickState.ariaPressed ||
          preClickState.ariaExpanded !== postClickState.ariaExpanded;

        if (stateChanged) {
          this.log('Click validated: state changed');
        }
      }
    }

    await this.postClickBehavior(clickTarget, viewport, options);

    this.lastPos = clickTarget;
    this.updateActionCount();
  }

  /**
   * Calculate click target
   */
  calculateClickTarget(box, options) {
    const clickPaddingFactor = options.clickPadding ?? 0.68;

    // Fatigue affects precision
    const fatigueOffset = (this.config.fatigueMultiplier - 1) * 0.15;

    const biasX = -0.1 + fatigueOffset;
    const biasY = -0.05 + fatigueOffset;

    const offsetX = (this.randomGaussian(biasX, 0.25 * this.config.fatigueMultiplier) * box.width) * clickPaddingFactor;
    const offsetY = (this.randomGaussian(biasY, 0.25 * this.config.fatigueMultiplier) * box.height) * clickPaddingFactor;

    let targetX = box.x + box.width / 2 + offsetX;
    let targetY = box.y + box.height / 2 + offsetY;

    const marginX = Math.min(8, box.width * 0.1);
    const marginY = Math.min(8, box.height * 0.1);

    targetX = this.clamp(targetX, box.x + marginX, box.x + box.width - marginX);
    targetY = this.clamp(targetY, box.y + marginY, box.y + box.height - marginY);

    return { x: targetX, y: targetY };
  }

  /**
   * NATURAL APPROACH: based on actual trajectory
   */
  calculateNaturalApproachTarget(clickTarget, box, viewport) {
    if (!this.lastPos) {
      // Fallback to random approach
      const distance = 25 + Math.random() * 35;
      const angle = Math.random() * Math.PI * 2;

      let x = clickTarget.x + Math.cos(angle) * distance;
      let y = clickTarget.y + Math.sin(angle) * distance;

      x = this.clamp(x, 0, viewport.width - 1);
      y = this.clamp(y, 0, viewport.height - 1);

      return { x, y };
    }

    // Calculate approach based on current trajectory
    const dx = clickTarget.x - this.lastPos.x;
    const dy = clickTarget.y - this.lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    // Direction from lastPos to target
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Approach distance: 25-60px from target along trajectory
    const approachDistance = 25 + Math.random() * 35;

    // Natural jitter perpendicular to trajectory (±15 degrees typical)
    const perpendicularAngle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * (Math.PI / 6);
    const jitterMagnitude = (Math.random() - 0.5) * 20 * this.config.fatigueMultiplier;

    let x = clickTarget.x - dirX * approachDistance + Math.cos(perpendicularAngle) * jitterMagnitude;
    let y = clickTarget.y - dirY * approachDistance + Math.sin(perpendicularAngle) * jitterMagnitude;

    x = this.clamp(x, 0, viewport.width - 1);
    y = this.clamp(y, 0, viewport.height - 1);

    return { x, y };
  }

  /**
   * Post-click
   */
  async postClickBehavior(clickTarget, viewport, options) {
    const behavior = Math.random();

    if (behavior < 0.35) {
      await this.randomDelay(120, 550);
    } else if (behavior < 0.65) {
      const jitterX = clickTarget.x + this.randomGaussian(0, 6 * this.config.fatigueMultiplier);
      const jitterY = clickTarget.y + this.randomGaussian(0, 6 * this.config.fatigueMultiplier);

      await this.moveToPosition(
        this.clamp(jitterX, 0, viewport.width - 1),
        this.clamp(jitterY, 0, viewport.height - 1),
        { ...options, numPoints: 2 }
      );

      await this.randomDelay(60, 220);
    } else {
      const awayDistance = 35 + Math.random() * 80;
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
   * Random move
   */
  async move(options = {}) {
    const viewport = await this.getViewport();

    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    const padding = 60;
    const targetX = padding + Math.random() * (viewport.width - 2 * padding);
    const targetY = padding + Math.random() * (viewport.height - 2 * padding);

    await this.moveToPosition(targetX, targetY, options);
    this.updateActionCount();
  }

  /**
   * CRITICAL: Ultra-realistic movement with 60-144Hz polling simulation
   */
  async moveToPosition(targetX, targetY, options = {}) {
    const viewport = await this.getViewport();

    if (!this.lastPos) {
      this.initializePosition(viewport);
    }

    targetX = this.clamp(targetX, 0, viewport.width - 1);
    targetY = this.clamp(targetY, 0, viewport.height - 1);

    const { points, targetDrift } = this.calculateHumanBezierPoints(
      this.lastPos.x,
      this.lastPos.y,
      targetX,
      targetY,
      null,
      viewport,
      options
    );

    // Execute with realistic polling rate
    for (let i = 0; i < points.length; i++) {
      let point = points[i];

      // Target drift
      if (targetDrift && i > points.length * 0.5) {
        const driftFactor = (i - points.length * 0.5) / (points.length * 0.5);
        point.x += targetDrift.x * driftFactor;
        point.y += targetDrift.y * driftFactor;
      }

      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      try {
        await this.page.mouse.move(point.x, point.y);
      } catch (error) {
        this.log('Mouse move failed:', error.message);
        continue;
      }

      // REALISTIC POLLING RATE: 60-144Hz (6.9-16.6ms)
      const phase = i / points.length;
      let pollingDelay = this.calculateRealisticPollingDelay(phase);

      // Apply fatigue to timing
      pollingDelay *= this.config.fatigueMultiplier;

      await this.randomDelay(pollingDelay, pollingDelay + 2);

      // Hesitation
      if (Math.random() < this.config.hesitationProbability && phase > 0.2 && phase < 0.8) {
        const hesitationDuration = this.randomGaussian(80, 40) * this.config.fatigueMultiplier;
        await this.randomDelay(Math.max(30, hesitationDuration), hesitationDuration + 50);
        this.log('Hesitation at', phase.toFixed(2));
      }
    }

    this.lastPos = { x: targetX, y: targetY };
    this.lastMoveTime = Date.now();
    this.addToHistory({ x: targetX, y: targetY, time: Date.now() });
  }

  /**
   * Calculate realistic polling delay (60-144Hz simulation)
   */
  calculateRealisticPollingDelay(phase) {
    // Typical distribution: most events at ~100Hz (10ms)
    // With occasional faster (144Hz) or slower (60Hz) bursts

    let baseDelay;

    const random = Math.random();

    if (random < 0.7) {
      // 70% typical rate: ~100Hz (8-12ms)
      baseDelay = this.config.typicalPollingInterval + (Math.random() - 0.5) * 4;
    } else if (random < 0.85) {
      // 15% faster: ~125-144Hz (6.9-8ms)
      baseDelay = this.config.minPollingInterval + Math.random() * 2;
    } else {
      // 15% slower: ~60-80Hz (12.5-16.6ms)
      baseDelay = 12.5 + Math.random() * 4;
    }

    // Phase modulation: slightly faster during cruise phase
    if (phase > 0.3 && phase < 0.7) {
      baseDelay *= 0.9; // 10% faster in cruise
    } else if (phase > 0.85) {
      baseDelay *= 1.2; // 20% slower near target (precision)
    }

    // Micro-variation (sensor noise simulation)
    baseDelay += (Math.random() - 0.5) * 1;

    return this.clamp(baseDelay, this.config.minPollingInterval, this.config.maxPollingInterval);
  }

  /**
   * Calculate ultra-realistic Bezier points
   */
  calculateHumanBezierPoints(startX, startY, targetX, targetY, box, viewport, options) {
    const D = this.calculateDistance({ x: startX, y: startY }, { x: targetX, y: targetY });

    const W = box ? Math.min(box.width, box.height) : (options.defaultTargetWidth ?? 100);
    const ID = Math.log2(D / W + 1);

    let complexityMultiplier = 1.0;
    switch (this.config.curveComplexity) {
      case 'low':
        complexityMultiplier = 0.7;
        break;
      case 'high':
        complexityMultiplier = 1.3;
        break;
      default:
        complexityMultiplier = 1.0;
    }

    let baseNumPoints = Math.max(15, Math.round(12 * ID * complexityMultiplier));
    baseNumPoints = this.applyFatigue(baseNumPoints);
    const numPoints = options.numPoints ?? baseNumPoints;

    const primaryControls = this.calculateRealisticControlPoints(
      startX, startY, targetX, targetY, D, options
    );

    let targetDrift = null;
    if (this.config.targetDriftEnabled && !options.isApproach && D > 100) {
      const driftMagnitude = this.randomGaussian(0, 3 * this.config.fatigueMultiplier);
      targetDrift = {
        x: driftMagnitude,
        y: driftMagnitude
      };
    }

    const baseJitter = options.jitterStdDev ?? 1.5;
    const jitterStdDev = baseJitter * this.config.fatigueMultiplier;
    const points = [];

    for (let i = 1; i <= numPoints; i++) {
      const linearT = i / numPoints;
      const easedT = this.multiLayerEasing(linearT, D);

      let point = this.getBezierPoint(easedT,
        primaryControls.p0,
        primaryControls.p1,
        primaryControls.p2,
        primaryControls.p3
      );

      // Micro-corrections
      if (Math.random() < this.config.microCorrectionFrequency && linearT > 0.2 && linearT < 0.9) {
        const correctionAngle = Math.random() * Math.PI * 2;
        const correctionMagnitude = this.randomGaussian(0, 4 * this.config.fatigueMultiplier);
        point.x += Math.cos(correctionAngle) * correctionMagnitude;
        point.y += Math.sin(correctionAngle) * correctionMagnitude;
      }

      // Progressive jitter
      const progressFactor = 1 - easedT;
      const distanceToEnd = progressFactor * D;
      const adaptiveJitter = jitterStdDev * Math.min(1.5, distanceToEnd / 70);

      point.x += this.randomGaussian(0, adaptiveJitter);
      point.y += this.randomGaussian(0, adaptiveJitter);

      // Attention errors
      if (this.config.attentionSpan < 0.95) {
        if (Math.random() > this.config.attentionSpan) {
          const errorMagnitude = (1 - this.config.attentionSpan) * 18 * this.config.fatigueMultiplier;
          point.x += this.randomGaussian(0, errorMagnitude * 0.25);
          point.y += this.randomGaussian(0, errorMagnitude * 0.25);
        }
      }

      // Sub-movements
      if (linearT > 0.3 && linearT < 0.85 && Math.random() < 0.12) {
        const subMovement = this.randomGaussian(0, 2.5 * this.config.fatigueMultiplier);
        point.x += subMovement;
        point.y += subMovement;
      }

      // Angular velocity variation
      if (i > 1 && Math.random() < 0.2) {
        const prevPoint = points[points.length - 1];
        const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x);
        const angleVariation = this.randomGaussian(0, 0.08);
        const dist = this.calculateDistance(prevPoint, point);

        point.x = prevPoint.x + Math.cos(angle + angleVariation) * dist;
        point.y = prevPoint.y + Math.sin(angle + angleVariation) * dist;
      }

      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      points.push(point);
    }

    const result = this.handleRealisticOvershoot(
      startX, startY, targetX, targetY, box, viewport, points, options, D, W
    );

    return {
      points: result.points,
      finalPos: result.finalPos,
      targetDrift: targetDrift
    };
  }

  /**
   * Realistic control points
   */
  calculateRealisticControlPoints(startX, startY, targetX, targetY, D, options) {
    const dx = targetX - startX;
    const dy = targetY - startY;

    const baseDeviation = D * (0.10 + Math.random() * 0.32);
    const deviation = options.isApproach ? baseDeviation * 0.35 : baseDeviation;

    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / length;
    const perpY = dx / length;

    const directionBias = Math.random() < 0.65 ? 1 : -1;

    const c1FactorBase = 0.18 + Math.random() * 0.24;
    const c2FactorBase = 0.54 + Math.random() * 0.28;

    const asymmetry = (Math.random() - 0.5) * 0.22;
    const c1Factor = this.clamp(c1FactorBase + asymmetry, 0.15, 0.48);
    const c2Factor = this.clamp(c2FactorBase - asymmetry, 0.50, 0.88);

    const c1Deviation = deviation * (0.5 + Math.random() * 0.6);
    const c2Deviation = deviation * (0.4 + Math.random() * 0.7);

    const fatigueImpact = this.config.fatigueMultiplier;
    const c1x = startX + dx * c1Factor + directionBias * c1Deviation * perpX * fatigueImpact;
    const c1y = startY + dy * c1Factor + directionBias * c1Deviation * perpY * fatigueImpact;

    const c2x = startX + dx * c2Factor + directionBias * c2Deviation * perpX * fatigueImpact;
    const c2y = startY + dy * c2Factor + directionBias * c2Deviation * perpY * fatigueImpact;

    return {
      p0: { x: startX, y: startY },
      p1: { x: c1x, y: c1y },
      p2: { x: c2x, y: c2y },
      p3: { x: targetX, y: targetY }
    };
  }

  /**
   * Multi-layer easing
   */
  multiLayerEasing(t, distance) {
    let eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Micro-variations
    const microVariation = (Math.random() - 0.5) * 0.02;
    eased += microVariation;

    // Tremor (high-frequency noise)
    const tremor = Math.sin(t * Math.PI * 8 + Math.random()) * 0.008;
    eased += tremor;

    // Attention lapses
    if (this.config.attentionSpan < 0.92 && Math.random() < 0.05) {
      const lapse = (Math.random() - 0.5) * 0.03;
      eased += lapse;
    }

    // Distance-based hesitation
    if (distance > 500 && t > 0.35 && t < 0.65 && Math.random() < 0.04) {
      eased *= 0.92;
    }

    return this.clamp(eased, 0, 1);
  }

  /**
   * Realistic overshoot
   */
  handleRealisticOvershoot(startX, startY, targetX, targetY, box, viewport, points, options, D, W) {
    const adjustedOvershootProb = (options.overshootProb ?? 0.16) * this.config.fatigueMultiplier;
    const isRandomTarget = !box;

    const shouldOvershoot = !isRandomTarget &&
                            !options.isApproach &&
                            D > 120 &&
                            Math.random() < adjustedOvershootProb &&
                            this.config.attentionSpan < 0.92;

    if (!shouldOvershoot) {
      return { points, finalPos: { x: targetX, y: targetY } };
    }

    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / length;
    const dirY = dy / length;

    let overshootFactor = (0.08 + Math.random() * 0.20) * this.config.fatigueMultiplier;
    let overshootDist = overshootFactor * W;

    let overshootX = targetX + dirX * overshootDist;
    let overshootY = targetY + dirY * overshootDist;

    const margin = 20;
    if (overshootX < margin || overshootX >= viewport.width - margin ||
        overshootY < margin || overshootY >= viewport.height - margin) {
      overshootDist *= 0.5;
      overshootX = targetX + dirX * overshootDist;
      overshootY = targetY + dirY * overshootDist;
    }

    overshootX = this.clamp(overshootX, margin, viewport.width - margin);
    overshootY = this.clamp(overshootY, margin, viewport.height - margin);

    const overshootResult = this.calculateHumanBezierPoints(
      startX, startY, overshootX, overshootY, box, viewport,
      { ...options, overshootProb: 0 }
    );

    const correctionPoints = this.generateRealisticCorrectionPath(
      overshootX, overshootY, targetX, targetY, viewport, options
    );

    return {
      points: overshootResult.points.concat(correctionPoints),
      finalPos: { x: targetX, y: targetY }
    };
  }

  /**
   * Correction path
   */
  generateRealisticCorrectionPath(overshootX, overshootY, targetX, targetY, viewport, options) {
    const correctionD = this.calculateDistance(
      { x: overshootX, y: overshootY },
      { x: targetX, y: targetY }
    );

    const correctionNumPoints = Math.max(8, Math.round(correctionD / 10));
    const baseJitter = options.jitterStdDev ?? 1.5;
    const jitterStdDev = baseJitter * 0.6 * this.config.fatigueMultiplier;

    const dx = targetX - overshootX;
    const dy = targetY - overshootY;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    const correctionDeviation = correctionD * (0.03 + Math.random() * 0.09);
    const perpX = -dy / length;
    const perpY = dx / length;
    const correctionSign = Math.random() < 0.5 ? -1 : 1;

    const c1x = overshootX + dx * 0.32 + correctionSign * correctionDeviation * perpX * Math.random();
    const c1y = overshootY + dy * 0.32 + correctionSign * correctionDeviation * perpY * Math.random();
    const c2x = overshootX + dx * 0.75 + correctionSign * correctionDeviation * perpX * Math.random();
    const c2y = overshootY + dy * 0.75 + correctionSign * correctionDeviation * perpY * Math.random();

    const p0 = { x: overshootX, y: overshootY };
    const p1 = { x: c1x, y: c1y };
    const p2 = { x: c2x, y: c2y };
    const p3 = { x: targetX, y: targetY };

    const correctionPoints = [];

    for (let i = 1; i <= correctionNumPoints; i++) {
      const linearT = i / correctionNumPoints;
      const easedT = this.multiLayerEasing(linearT, correctionD);

      let point = this.getBezierPoint(easedT, p0, p1, p2, p3);

      point.x += this.randomGaussian(0, jitterStdDev);
      point.y += this.randomGaussian(0, jitterStdDev);

      point.x = this.clamp(point.x, 0, viewport.width - 1);
      point.y = this.clamp(point.y, 0, viewport.height - 1);

      correctionPoints.push(point);
    }

    return correctionPoints;
  }

  /**
   * Micro adjustment
   */
  async microMouseAdjustment() {
    if (!this.lastPos) return;

    const microX = this.lastPos.x + this.randomGaussian(0, 2.5 * this.config.fatigueMultiplier);
    const microY = this.lastPos.y + this.randomGaussian(0, 2.5 * this.config.fatigueMultiplier);

    const viewport = await this.getViewport();

    try {
      await this.page.mouse.move(
        this.clamp(microX, 0, viewport.width - 1),
        this.clamp(microY, 0, viewport.height - 1)
      );
    } catch (error) {
      // Silent
    }
  }

  /**
   * Bezier point
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
   * Easing
   */
  easeInOutCubic(t) {
    const variance = (Math.random() - 0.5) * 0.018;
    t = this.clamp(t + variance, 0, 1);

    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Gaussian
   */
  randomGaussian(mean = 0, stdDev = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  /**
   * Human reaction delay
   */
  async humanReactionDelay() {
    const baseTime = this.config.baseReactionTime;
    const variance = this.config.reactionTimeVariance;

    const attentionFactor = 1 + (1 - this.config.attentionSpan) * 0.6;
    const fatigueFactor = this.config.fatigueMultiplier;

    const reactionTime = Math.max(85, this.randomGaussian(baseTime * attentionFactor * fatigueFactor, variance));

    await this.randomDelay(reactionTime * 0.75, reactionTime * 1.25);
  }

  /**
   * Random delay
   */
  async randomDelay(min, max) {
    const microVar = (Math.random() - 0.5) * 10;
    const delay = min + Math.random() * (max - min) + microVar;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
  }

  /**
   * Distance
   */
  calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clamp
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Initialize
   */
  initializePosition(viewport) {
    const margin = 120;
    const x = margin + Math.pow(Math.random(), 1.3) * (viewport.width - 2 * margin);
    const y = margin + Math.random() * (viewport.height - 2 * margin);

    this.lastPos = { x, y };
    this.lastMoveTime = Date.now();
    this.log('Position initialized:', this.lastPos);
  }

  /**
   * Apply COHERENT fatigue
   */
  applyFatigue(baseValue) {
    if (!this.config.fatigueEnabled) return baseValue;

    if (this.config.actionCount > this.config.maxFatigue) {
      this.config.actionCount = Math.floor(this.config.fatigueThreshold * 0.8);
      this.config.attentionSpan = Math.min(0.96, this.config.attentionSpan + 0.08);
      this.config.fatigueMultiplier = 1.0;
      this.log('Fatigue reset');
    }

    if (this.config.actionCount > this.config.fatigueThreshold) {
      const excess = this.config.actionCount - this.config.fatigueThreshold;
      const fatigueLevel = excess / this.config.fatigueThreshold;

      // Unified fatigue multiplier (affects all aspects coherently)
      this.config.fatigueMultiplier = 1.0 + fatigueLevel * 0.4; // Up to 40% slower/less precise

      return Math.round(baseValue * Math.min(1 + fatigueLevel * 0.018, 1.45));
    }

    return baseValue;
  }

  /**
   * Update action count
   */
  updateActionCount() {
    this.config.actionCount++;

    if (this.config.actionCount % 45 === 0) {
      const recovery = Math.floor(15 + Math.random() * 10);
      this.config.actionCount = Math.max(0, this.config.actionCount - recovery);
      this.config.attentionSpan = Math.min(0.96, this.config.attentionSpan + 0.04);
      this.config.fatigueMultiplier = Math.max(1.0, this.config.fatigueMultiplier * 0.85);
      this.log('Recovery applied');
    }

    this.config.attentionSpan = Math.max(
      this.config.minAttentionSpan,
      this.config.attentionSpan - 0.0008
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
   * Stats
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
      attentionSpan: this.config.attentionSpan,
      fatigueLevel: Math.max(0, this.config.actionCount - this.config.fatigueThreshold),
      fatigueMultiplier: this.config.fatigueMultiplier
    };
  }

  /**
   * Reset
   */
  reset() {
    this.config.actionCount = 0;
    this.config.attentionSpan = 0.88 + Math.random() * 0.10;
    this.config.fatigueMultiplier = 1.0;
    this.moveHistory = [];
    this.lastPos = null;
    this.invalidateViewportCache();
    this.log('State reset complete');
  }
}

module.exports = ShyMouse;