const html = document.getElementsByTagName("html")[0];
import {getScreenFrameRate} from "./CommonTool.js";
import {Bezier} from "./Bezier.js";

const RETURN_TIME = 750;

export class Inertia {
    // 弹性
    elastic = true;
    // 弹性最大距离（px）
    elasticMaxDistance = 200;
    // 反弹
    rebound = false;
    // 回调函数
    outputCoordinate = null;

    // 目标 dom
    targetEl = null;

    // 是否按下
    isCursorDown = false;
    isUpdateElCoordinate = false;
    // 是否在缓动中
    isInching = false;
    lastInchingTime = 0;
    frame = 11.11;
    beforeBeyond = null;
    x = {
        startInchingTime: -1,
        isReturn: false,
        expectedMove: 0,
        outerStartInchingTime: 0,
        moveSpeed: 0,
        realTimeMoveSpeed: 0
    }
    y = {
        startInchingTime: -1,
        isReturn: false,
        expectedMove: 0,
        outerStartInchingTime: 0,
        moveSpeed: 0,
        realTimeMoveSpeed: 0
    }

    targetCoordinate = [0, 0];
    beforeCoordinate = [0, 0];
    currentCoordinate = [0, 0];
    simulateClientRect = null;
    trackPoints = [];

    boundX = null;
    boundY = null;

    bezier = new Bezier(.16, .53, .36, .97);
    inchingBezier = new Bezier(.32, .68, .42, .93);
    returnBezier = new Bezier(.17, .69, .45, .88);

    constructor({boundX, boundY, elastic, elasticMaxDistance, rebound, outputCoordinate}) {
        getScreenFrameRate().then(r => {
            this.frame = r;
        });

        this.boundX = Array.isArray(boundX) ? boundX : [];
        this.boundY = Array.isArray(boundY) ? boundY : [];

        if (void(0) !== elastic) {
            this.elastic = !!elastic;
        }
        if (Number.isSafeInteger(elasticMaxDistance)) {
            this.elasticMaxDistance = Math.max(0, this.elasticMaxDistance);
        }
        if (void(0) !== rebound) {
            this.rebound = !!rebound;
        }

        this.outputCoordinate = outputCoordinate;

        this.targetEl = document.getElementById("inertia-move");
        this.targetEl.addEventListener("mousedown", this.cursorDown);
    }

    removeEvents = () => {
        html.removeEventListener("mousemove", this.cursorMove, {
            passive: false
        });
        html.removeEventListener("mouseup", this.cursorUp);
    }

    addEvents = () => {
        this.removeEvents();

        html.addEventListener("mousemove", this.cursorMove, {
            passive: false
        });
        html.addEventListener("mouseup", this.cursorUp);
    }

    cursorDown = (event) => {
        console.clear();
        if (!this.isCursorDown) {
            let targetRectBound = this.targetEl.getBoundingClientRect();
            this.targetCoordinate = [targetRectBound.left, targetRectBound.top];
            this.beforeCoordinate = this.currentCoordinate = [event.clientX, event.clientY];
            this.simulateClientRect = {
                left: targetRectBound.left,
                right: targetRectBound.right,
                top: targetRectBound.top,
                bottom: targetRectBound.bottom
            }

            this.trackPoints = [];
            this.recordTrackPoints(this.currentCoordinate);

            this.isCursorDown = true;
            this.isUpdateElCoordinate = false;
            this.isInching = false;

            this.addEvents();
        }
    }

    cursorMove = (event) => {
        event.preventDefault();
        if (this.isCursorDown) {
            this.currentCoordinate = [event.clientX, event.clientY];
            this.recordTrackPoints(this.currentCoordinate);
            if (!this.isUpdateElCoordinate) {
                this.isUpdateElCoordinate = true;
                window.requestAnimationFrame(this.updateElCoordinateByMove);
            }
        }
    }

    cursorUp = (event) => {
        this.isCursorDown = false;
        this.recordTrackPoints([event.clientX, event.clientY]);

        let firstPoint = this.trackPoints[0];
        let lastPoint = this.trackPoints[this.trackPoints.length - 1];

        let offsetX = lastPoint.x - firstPoint.x;
        let offsetY = lastPoint.y - firstPoint.y;
        let offsetTime = lastPoint.time - firstPoint.time;

        this.x.moveSpeed = (offsetX / offsetTime) || 0;
        this.y.moveSpeed = (offsetY / offsetTime) || 0;
        this.x.realTimeMoveSpeed = this.x.moveSpeed;
        this.y.realTimeMoveSpeed = this.y.moveSpeed;

        this.x.startInchingTime = -1;
        this.x.isReturn = false;
        this.x.expectedMove = 0;
        this.x.outerStartInchingTime = 0;

        this.y.startInchingTime = -1;
        this.y.isReturn = false;
        this.y.expectedMove = 0;
        this.y.outerStartInchingTime = 0;

        this.lastInchingTime = -1;

        console.table({
            "x 移动距离": offsetX,
            "x 移动速度": this.x.moveSpeed,
            "y 移动距离": offsetY,
            "y 移动速度": this.y.moveSpeed
        });

        let beyond = this.checkBound(this.targetEl.getBoundingClientRect());

        if (Math.abs(this.x.moveSpeed) > 0.4 || Math.abs(this.y.moveSpeed) > 0.4) {
            // 速度大于某个值或不全在内部或没完全覆盖执行
            this.isInching = true;
            this.beforeBeyond = null;

            window.requestAnimationFrame(this.updateElCoordinateForUp);
        } else {
            if (beyond.escape) {
                this.isInching = true;
                this.beforeBeyond = null;
                this.maxBeyond = [];
                this.simulateMaxBeyond = [];
                window.requestAnimationFrame(this.updateElCoordinateForReturn);
            }
        }

        this.removeEvents();
    }

    maxBeyond = [];
    simulateMaxBeyond = [];
    updateElCoordinateForReturn = (timing) => {
        let targetRectBound = this.targetEl.getBoundingClientRect();
        let beyond = this.checkBound(targetRectBound);
        let simulateBeyond = this.checkBound(this.simulateClientRect);
        if (!this.isInching || (!beyond.escape && !simulateBeyond.escape)) {
            return;
        }

        if (this.x.startInchingTime === -1 && this.y.startInchingTime === -1) {
            this.x.startInchingTime = this.y.startInchingTime = timing - this.frame;
            this.maxBeyond = beyond;
            this.simulateMaxBeyond = simulateBeyond;
        }

        let offsetX = 0, offsetY = 0, simulateOffsetX = 0, simulateOffsetY = 0;

        if (beyond.beyondX !== 0) {
            let timeOffset = (timing - this.x.startInchingTime) > RETURN_TIME ? RETURN_TIME : (timing - this.x.startInchingTime);
            let ratio = this.returnBezier.easing(timeOffset / RETURN_TIME);
            ratio = 1 - Math.max(0, Math.min(ratio, 1));
            offsetX = (this.maxBeyond.beyondX * ratio) - beyond.beyondX;
        }
        if (beyond.beyondY !== 0) {
            let timeOffset = (timing - this.y.startInchingTime) > RETURN_TIME ? RETURN_TIME : (timing - this.y.startInchingTime);
            let ratio = this.returnBezier.easing(timeOffset / RETURN_TIME);
            ratio = 1 - Math.max(0, Math.min(ratio, 1));
            offsetY = (this.maxBeyond.beyondY * ratio) - beyond.beyondY;
        }

        if (simulateBeyond.beyondX !== 0) {
            let timeOffset = (timing - this.x.startInchingTime) > RETURN_TIME ? RETURN_TIME : (timing - this.x.startInchingTime);
            let ratio = this.returnBezier.easing(timeOffset / RETURN_TIME);
            ratio = 1 - Math.max(0, Math.min(ratio, 1));
            simulateOffsetX = (this.simulateMaxBeyond.beyondX * ratio) - simulateBeyond.beyondX;
        }
        if (simulateBeyond.beyondY !== 0) {
            let timeOffset = (timing - this.y.startInchingTime) > RETURN_TIME ? RETURN_TIME : (timing - this.y.startInchingTime);
            let ratio = this.returnBezier.easing(timeOffset / RETURN_TIME);
            ratio = 1 - Math.max(0, Math.min(ratio, 1));
            simulateOffsetY = (this.simulateMaxBeyond.beyondY * ratio) - simulateBeyond.beyondY;
        }

        this.simulateClientRect.left += simulateOffsetX;
        this.simulateClientRect.right += simulateOffsetX;
        this.simulateClientRect.top += simulateOffsetY;
        this.simulateClientRect.bottom += simulateOffsetY;

        if (this.outputCoordinate instanceof Function) {
            this.outputCoordinate({
                moveX: offsetX,
                moveY: offsetY,
                left: targetRectBound.left + offsetX,
                right: targetRectBound.right + offsetX,
                top: targetRectBound.top + offsetY,
                bottom: targetRectBound.bottom + offsetY,
                simulate: {
                    moveX: simulateOffsetX,
                    moveY: simulateOffsetY,
                    left: this.simulateClientRect.left,
                    right: this.simulateClientRect.right,
                    top: this.simulateClientRect.top,
                    bottom: this.simulateClientRect.bottom
                }
            });
        }

        window.requestAnimationFrame(this.updateElCoordinateForReturn);
    }

    calcOffset = async (xy, beyondXY, beforeBeyondXY, timing) => {
        let offset;
        if (beyondXY === 0) {
            if (void(0) === beforeBeyondXY || beforeBeyondXY !== 0) {
                xy.moveSpeed = xy.realTimeMoveSpeed;
            }

            let timeOffset = (timing - xy.startInchingTime) > 1500 ? 1500 : (timing - xy.startInchingTime);
            let ratio = 1 - this.inchingBezier.easing(timeOffset / 1500);
            ratio = Math.max(0, Math.min(ratio, 1));
            xy.realTimeMoveSpeed = xy.moveSpeed * ratio;
            // 由补偿换为按时间计算，更加准确（避免在高刷屏中动画执行速度变快）
            offset = xy.realTimeMoveSpeed * 1 * (timing - this.lastInchingTime);
        } else {
            xy.startInchingTime += timing - this.lastInchingTime;

            let totalRatio = 0;
            let expectMoveSpeedX = 0;
            if (void(0) === beforeBeyondXY || beforeBeyondXY === 0) {
                xy.expectedMove = 0;
                for (let i = this.frame; i < 250; i += this.frame) {
                    let ratio = 1 - this.inchingBezier.easing(i / 250);
                    ratio = Math.max(0, Math.min(ratio, 1));
                    if (ratio < 0.5) {
                        break;
                    }
                    totalRatio += ratio;
                }
                xy.expectedMove = totalRatio * xy.realTimeMoveSpeed * this.frame * 1;

                if (void(0) === beforeBeyondXY) {
                    // mouseup 时已越界
                    // 对速度补偿
                    expectMoveSpeedX = beyondXY / totalRatio / this.frame / 1 * 0.5;
                    if (xy.realTimeMoveSpeed < 0) {
                        xy.moveSpeed = xy.realTimeMoveSpeed = Math.min(-Math.abs(expectMoveSpeedX), xy.realTimeMoveSpeed);
                    } else if (xy.realTimeMoveSpeed > 0) {
                        xy.moveSpeed = xy.realTimeMoveSpeed = Math.max(Math.abs(expectMoveSpeedX), xy.realTimeMoveSpeed);
                    } else {
                        if (beyondXY < 0) {
                            xy.moveSpeed = xy.realTimeMoveSpeed = Math.abs(expectMoveSpeedX);
                        } else if (beyondXY > 0) {
                            xy.moveSpeed = xy.realTimeMoveSpeed = -Math.abs(expectMoveSpeedX);
                        }
                    }

                    if ((beyondXY < xy.expectedMove && beyondXY < 0 && xy.realTimeMoveSpeed < 0)
                        || (beyondXY > xy.expectedMove && beyondXY > 0 && xy.realTimeMoveSpeed > 0)
                        || beyondXY < 0 && xy.realTimeMoveSpeed > 0
                        || beyondXY > 0 && xy.realTimeMoveSpeed < 0) {
                        // 超过预测距离，设置值以触发直接返回
                        xy.outerStartInchingTime = timing - 150;
                    } else {
                        // 未超过预测距离，设置已运动距离所需时间
                        xy.outerStartInchingTime = timing - (beyondXY / xy.expectedMove * 150);
                    }
                } else {
                    xy.moveSpeed = xy.realTimeMoveSpeed = xy.realTimeMoveSpeed * 0.5;
                    xy.outerStartInchingTime = timing - this.frame;
                }
            }

            let timeOffset = (timing - xy.outerStartInchingTime) > 150 ? 150 : (timing - xy.outerStartInchingTime);
            let outsideRatio = this.inchingBezier.easing(timeOffset / 150);
            outsideRatio = Math.max(0, Math.min(outsideRatio, 1));
            if (timing - xy.outerStartInchingTime < 150) {
                offset = (xy.expectedMove * outsideRatio) - beyondXY;
            } else {
                xy.isReturn = true;
                if (beyondXY < 0) {
                    xy.realTimeMoveSpeed = Math.abs(xy.realTimeMoveSpeed);
                } else if (beyondXY > 0) {
                    xy.realTimeMoveSpeed = -Math.abs(xy.realTimeMoveSpeed);
                }
                offset = xy.realTimeMoveSpeed * 1 * (timing - this.lastInchingTime);
            }
        }

        return offset;
    }

    updateElCoordinateForUp = async (timing) => {
        if (this.x.startInchingTime === -1 && this.y.startInchingTime === -1 && this.lastInchingTime === -1) {
            this.lastInchingTime = this.x.startInchingTime = this.y.startInchingTime = timing - this.frame;
        }

        let beyond = this.checkBound(this.targetEl.getBoundingClientRect());

        if (!this.isInching || (!beyond.escape && (Math.abs(this.x.realTimeMoveSpeed) <= 0 && Math.abs(this.y.realTimeMoveSpeed) <= 0))) {
            return;
        }
        if (timing - this.lastInchingTime > this.frame * 2) {
            // https://developer.mozilla.org/zh-CN/docs/Web/API/window/requestAnimationFrame
            // 大多数浏览器处于后台时 requestAnimationFrame 会暂停执行，此处修正时间
            let offsetTime = timing - this.lastInchingTime - this.frame;
            this.lastInchingTime += offsetTime;
            this.x.startInchingTime += offsetTime;
            this.y.startInchingTime += offsetTime;
            this.x.outerStartInchingTime += offsetTime;
            this.y.outerStartInchingTime += offsetTime;
        }
        this.x.startInchingTime = this.y.startInchingTime = Math.min(this.x.startInchingTime, this.y.startInchingTime);

        let result = await Promise.all([
            this.calcOffset(this.x, beyond.beyondX, this.beforeBeyond?.beyondX, timing),
            this.calcOffset(this.y, beyond.beyondY, this.beforeBeyond?.beyondY, timing)
        ]);

        if (this.outputCoordinate instanceof Function) {
            this.outputCoordinate({
                moveX: result[0],
                moveY: result[1]
            });
        }

        this.beforeBeyond = beyond;
        this.lastInchingTime = timing;

        window.requestAnimationFrame(this.updateElCoordinateForUp);
    }

    updateElCoordinateByMove = () => {
        let offsetX, offsetY, simulateOffsetX, simulateOffsetY;
        offsetX = simulateOffsetX = this.currentCoordinate[0] - this.beforeCoordinate[0];
        offsetY = simulateOffsetY = this.currentCoordinate[1] - this.beforeCoordinate[1];

        let targetRectBound = this.targetEl.getBoundingClientRect();
        let beyond = this.checkBound(targetRectBound);
        let simulateBeyond = this.checkBound(this.simulateClientRect);

        if (this.elastic) {
            if (beyond.beyondX !== 0)
                offsetX *= this.dragBezier(beyond.beyondX);
            if (beyond.beyondY !== 0)
                offsetY *= this.dragBezier(beyond.beyondY);

            if (simulateBeyond.beyondX !== 0)
                simulateOffsetX *= this.dragBezier(simulateBeyond.beyondX);
            if (simulateBeyond.beyondY !== 0)
                simulateOffsetY *= this.dragBezier(simulateBeyond.beyondY);

            // 超过了限定范围
            let exceed;
            if (offsetX > 0) {
                exceed = targetRectBound.left + offsetX - this.boundX[0] - this.elasticMaxDistance;
                if (exceed > 0) offsetX -= exceed;
            } else if (offsetX < 0) {
                exceed = targetRectBound.right + offsetX - this.boundX[1] + this.elasticMaxDistance;
                if (exceed < 0) offsetX -= exceed;
            }
            if (offsetY > 0) {
                exceed = targetRectBound.top + offsetY - this.boundY[0] - this.elasticMaxDistance;
                if (exceed > 0) offsetY -= exceed;
            } else if (offsetY < 0) {
                exceed = targetRectBound.bottom + offsetY - this.boundY[1] + this.elasticMaxDistance;
                if (exceed < 0) offsetY -= exceed;
            }
        } else {
            if (targetRectBound.left + offsetX > this.boundX[0]) {
                offsetX = this.boundX[0] - targetRectBound.left;
            } else if (targetRectBound.right + offsetX < this.boundX[1]) {
                offsetX = this.boundX[1] - targetRectBound.right;
            }
            if (targetRectBound.top + offsetY > this.boundY[0]) {
                offsetY = this.boundY[0] - targetRectBound.top;
            } else if (targetRectBound.bottom + offsetY < this.boundY[1]) {
                offsetY = this.boundY[1] - targetRectBound.bottom;
            }

            if (this.simulateClientRect.left + simulateOffsetX > this.boundX[0]) {
                simulateOffsetX = this.boundX[0] - this.simulateClientRect.left;
            } else if (this.simulateClientRect.right + simulateOffsetX < this.boundX[1]) {
                simulateOffsetX = this.boundX[1] - this.simulateClientRect.right;
            }
            if (this.simulateClientRect.top + simulateOffsetY > this.boundY[0]) {
                simulateOffsetY = this.boundY[0] - this.simulateClientRect.top;
            } else if (this.simulateClientRect.bottom + simulateOffsetY < this.boundY[1]) {
                simulateOffsetY = this.boundY[1] - this.simulateClientRect.bottom;
            }
        }

        this.simulateClientRect.left += simulateOffsetX;
        this.simulateClientRect.right += simulateOffsetX;
        this.simulateClientRect.top += simulateOffsetY;
        this.simulateClientRect.bottom += simulateOffsetY;

        if (this.outputCoordinate instanceof Function) {
            this.outputCoordinate({
                moveX: offsetX,
                moveY: offsetY,
                left: targetRectBound.left + offsetX,
                right: targetRectBound.right + offsetX,
                top: targetRectBound.top + offsetY,
                bottom: targetRectBound.bottom + offsetY,
                simulate: {
                    moveX: simulateOffsetX,
                    moveY: simulateOffsetY,
                    left: this.simulateClientRect.left,
                    right: this.simulateClientRect.right,
                    top: this.simulateClientRect.top,
                    bottom: this.simulateClientRect.bottom
                }
            });
        }

        this.beforeCoordinate = this.currentCoordinate;
        this.isUpdateElCoordinate = false;
    }

    dragBezier = (beyond) => {
        let ratio = Math.min(Math.abs(beyond), this.elasticMaxDistance) / this.elasticMaxDistance;
        ratio = this.bezier.easing(ratio);
        return 1 - Math.max(0, Math.min(ratio, 1));
    }

    checkBound = (clientRect) => {
        let beyondX = 0, beyondY = 0;

        if (Array.isArray(this.boundX)) {
            if (Number.isFinite(this.boundX[0]) && clientRect.left > this.boundX[0]) {
                beyondX = clientRect.left - this.boundX[0];
            } else if (Number.isFinite(this.boundX[1]) && clientRect.right < this.boundX[1]) {
                beyondX = clientRect.right - this.boundX[1];
            }
        }

        if (Array.isArray(this.boundY)) {
            if (Number.isFinite(this.boundY[0]) && clientRect.top > this.boundY[0]) {
                beyondY = clientRect.top - this.boundY[0];
            } else if (Number.isFinite(this.boundY[1]) && clientRect.bottom < this.boundY[1]) {
                beyondY = clientRect.bottom - this.boundY[1];
            }
        }

        return {
            beyondX: beyondX,
            beyondY: beyondY,
            escape: beyondX !== 0 || beyondY !== 0
        }
    }

    recordTrackPoints = (point) => {
        let now = Date.now();

        while (this.trackPoints.length > 0) {
            if (now - this.trackPoints[0].time > 100) {
                this.trackPoints.shift();
            } else break;
        }


        this.trackPoints.push({
            x: point[0],
            y: point[1],
            time: now
        });
    }
}