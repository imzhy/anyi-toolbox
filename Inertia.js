const html = document.getElementsByTagName("html")[0];
import {getScreenFrameRate} from "./CommonTool.js";
import {CubicBezier} from "./CubicBezier.js";

export class Inertia {
    // 目标 dom
    targetEl = null;
    parentEl = null;

    // 是否按下
    isCursorDown = false;
    isUpdateElCoordinate = false;
    // 是否在缓动中
    isInching = false;
    lastInchingTime = 0;
    frame = 11.11;
    beforeBound = null;
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
    trackPoints = [];

    boundX = null;
    boundY = null;

    bezier = null;
    inchingBezier = null;

    constructor({boundX, boundY}) {
        this.targetEl = document.getElementById("inertia-move");
        this.parentEl = this.targetEl.parentElement;

        this.bezier = new CubicBezier([
            [0, 0],
            [.16, .53,],
            [.36, .97],
            [1, 1]
        ]);
        this.inchingBezier = new CubicBezier([
            [0, 0],
            [.32, .68,],
            [.42, .93],
            [1, 1]
        ]);

        this.boundX = boundX;
        this.boundY = boundY;

        getScreenFrameRate().then(r => {
            this.frame = r;
        });

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
            let parentRectBound = this.parentEl.getBoundingClientRect();
            this.boundX = [parentRectBound.left, parentRectBound.right];
            this.boundY = [parentRectBound.top, parentRectBound.bottom];

            let targetRectBound = this.targetEl.getBoundingClientRect();
            this.targetCoordinate = [targetRectBound.left - parentRectBound.left, targetRectBound.top - parentRectBound.top];

            this.isCursorDown = true;
            this.beforeCoordinate = this.currentCoordinate = [event.clientX, event.clientY];

            this.trackPoints = [];
            this.recordTrackPoints(this.currentCoordinate);

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
                window.requestAnimationFrame(this.updateElCoordinate);
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

        let beyond = this.checkBound();

        if (Math.abs(this.x.moveSpeed) > 0.4 || Math.abs(this.y.moveSpeed) > 0.4) {
            // 速度大于某个值或不全在内部或没完全覆盖执行
            this.isInching = true;
            this.beforeBound = null;

            window.requestAnimationFrame(this.updateElCoordinateForUp);
        } else {
            if (!beyond.allOver) {
                this.isInching = true;
                window.requestAnimationFrame(this.updateElCoordinateForReturn);
            }
        }

        this.removeEvents();
    }

    updateElCoordinateForReturn = (timing) => {
        if (this.x.startInchingTime === -1 && this.y.startInchingTime === -1) {
            this.x.startInchingTime = this.y.startInchingTime = timing - this.frame;
        }

        let beyond = this.checkBound();
        if (!this.isInching || beyond.allOver) {
            return;
        }

        if (beyond.beyondX !== 0) {
            let ratioX = this.bezier.solve((timing - this.y.startInchingTime) / 1000);
            ratioX = Math.max(0, Math.min(ratioX, 1));
            this.targetCoordinate[0] -= beyond.beyondX * ratioX;
        }
        if (beyond.beyondY !== 0) {
            let ratioY = this.bezier.solve((timing - this.y.startInchingTime) / 1000);
            ratioY = Math.max(0, Math.min(ratioY, 1));
            this.targetCoordinate[1] -= beyond.beyondY * ratioY;
        }

        this.targetEl.style.transform = `translate(${this.targetCoordinate[0]}px, ${this.targetCoordinate[1]}px)`;
        window.requestAnimationFrame(this.updateElCoordinateForReturn);
    }

    calcOffset = async (xy, beyondXY, beforeBeyondXY, timing) => {
        let offset;
        if (beyondXY === 0) {
            if (beforeBeyondXY === undefined || beforeBeyondXY !== 0) {
                xy.moveSpeed = xy.realTimeMoveSpeed;
            }

            let ratio = 1 - this.inchingBezier.solve((timing - xy.startInchingTime) / 1500);
            ratio = Math.max(0, Math.min(ratio, 1));
            xy.realTimeMoveSpeed = xy.moveSpeed * ratio;
            // 由补偿换为按时间计算，更加准确（避免在高刷屏中动画执行速度变快）
            offset = xy.realTimeMoveSpeed * 1 * (timing - this.lastInchingTime);
        } else {
            xy.startInchingTime += timing - this.lastInchingTime;

            let totalRatio = 0;
            let expectMoveSpeedX = 0;
            if (beforeBeyondXY === undefined || beforeBeyondXY === 0) {
                xy.expectedMove = 0;
                for (let i = this.frame; i < 250; i += this.frame) {
                    let ratio = 1 - this.inchingBezier.solve(i / 250);
                    ratio = Math.max(0, Math.min(ratio, 1));
                    if (ratio < 0.5) {
                        break;
                    }
                    totalRatio += ratio;
                }
                xy.expectedMove = totalRatio * xy.realTimeMoveSpeed * this.frame * 1;

                if (beforeBeyondXY === undefined) {
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

            let outofRatioX = this.inchingBezier.solve((timing - xy.outerStartInchingTime) / 150);
            outofRatioX = Math.max(0, Math.min(outofRatioX, 1));
            if (timing - xy.outerStartInchingTime < 150) {
                offset = (xy.expectedMove * outofRatioX) - beyondXY;
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

        let beyond = this.checkBound();

        if (!this.isInching || (beyond.allOver && (Math.abs(this.x.realTimeMoveSpeed) <= 0 && Math.abs(this.y.realTimeMoveSpeed) <= 0))) {
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
            this.calcOffset(this.x, beyond.beyondX, this.beforeBound?.beyondX, timing),
            this.calcOffset(this.y, beyond.beyondY, this.beforeBound?.beyondY, timing)
        ]);
        this.targetCoordinate[0] += result[0];
        this.targetCoordinate[1] += result[1];

        this.beforeBound = beyond;
        this.lastInchingTime = timing;
        this.targetEl.style.transform = `translate(${this.targetCoordinate[0]}px, ${this.targetCoordinate[1]}px)`;

        window.requestAnimationFrame(this.updateElCoordinateForUp);
    }

    updateElCoordinate = () => {
        let offsetX = this.currentCoordinate[0] - this.beforeCoordinate[0];
        let offsetY = this.currentCoordinate[1] - this.beforeCoordinate[1];

        let beyond = this.checkBound();
        // todo 测试
        // beyond = {beyondX: 0, beyondY: 0};

        if (true) {
            if (beyond.beyondX !== 0) {
                this.targetCoordinate[0] += offsetX * this.dragBezier(beyond.beyondX);
            } else {
                this.targetCoordinate[0] += offsetX;
            }

            if (beyond.beyondY !== 0) {
                this.targetCoordinate[1] += offsetY * this.dragBezier(beyond.beyondY);
            } else {
                this.targetCoordinate[1] += offsetY;
            }
        } else {
            let targetRectBound = this.targetEl.getBoundingClientRect();

            if (targetRectBound.left + offsetX > this.boundX[0]) {
                this.targetCoordinate[0] = 0;
            } else if (targetRectBound.right + offsetX < this.boundX[1]) {
                this.targetCoordinate[0] = -targetRectBound.width + (this.boundX[1] - this.boundX[0]);
            } else {
                this.targetCoordinate[0] += offsetX;
            }

            if (targetRectBound.top + offsetY > this.boundY[0]) {
                this.targetCoordinate[1] = 0;
            } else if (targetRectBound.bottom + offsetY < this.boundY[1]) {
                this.targetCoordinate[1] = -targetRectBound.height + (this.boundY[1] - this.boundY[0]);
            } else {
                this.targetCoordinate[1] += offsetY;
            }
        }

        this.targetEl.style.transform = `translate(${this.targetCoordinate[0]}px, ${this.targetCoordinate[1]}px)`;

        this.beforeCoordinate = this.currentCoordinate;
        this.isUpdateElCoordinate = false;
    }

    sss = 200;
    /**
     * https://easings.net/
     * @param {number} beyond 偏移像素
     * @returns 比例
     */
    easeOut = (beyond) => {
        let ratio = Math.min(Math.abs(beyond), this.sss) / this.sss;
        ratio = 1 - Math.pow(1 - ratio, 1.6);
        return 1 - Math.max(0.01, Math.min(ratio, 0.99));
    }

    dragBezier = (beyond) => {
        let ratio = Math.min(Math.abs(beyond), this.sss) / this.sss;
        ratio = this.bezier.solve(ratio);
        return 1 - Math.max(0.01, Math.min(ratio, 0.99));
    }

    checkBound = () => {
        let beyondX = 0, beyondY = 0;

        let targetRectBound = this.targetEl.getBoundingClientRect();

        if (this.boundX) {
            if (!Number.isNaN(this.boundX[0]) && targetRectBound.left > this.boundX[0]) {
                beyondX = targetRectBound.left - this.boundX[0];
            } else if (!Number.isNaN(this.boundX[1]) && targetRectBound.right < this.boundX[1]) {
                beyondX = targetRectBound.right - this.boundX[1];
            }
        }

        if (this.boundY) {
            if (!Number.isNaN(this.boundY[0]) && targetRectBound.top > this.boundY[0]) {
                beyondY = targetRectBound.top - this.boundY[0];
            } else if (!Number.isNaN(this.boundY[1]) && targetRectBound.bottom < this.boundY[1]) {
                beyondY = targetRectBound.bottom - this.boundY[1];
            }
        }

        return {
            beyondX: beyondX,
            beyondY: beyondY,
            allOver: beyondX === 0 && beyondY === 0
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