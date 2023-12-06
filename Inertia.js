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
    startInchingTimeX = 0;
    startInchingTimeY = 0;
    lastInchingTime = 0;
    frame = 11.11;
    beforeBound = null;
    expectedMoveX = 0;
    expectedMoveY = 0;
    isReturnX = false;
    isReturnY = false;
    outerStartInchingTimeX = 0;
    outerStartInchingTimeY = 0;

    targetCoordinate = [0, 0];
    beforeCoordinate = [0, 0];
    currentCoordinate = [0, 0];
    trackPoints = [];

    boundX = null;
    boundY = null;

    bezier = null;
    inchingBezier = null;

    moveSpeedX = 0;
    moveSpeedY = 0;
    realTimeMoveSpeedX = 0;
    realTimeMoveSpeedY = 0;

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

        this.moveSpeedX = (offsetX / offsetTime) || 0;
        this.moveSpeedY = (offsetY / offsetTime) || 0;
        this.realTimeMoveSpeedX = this.moveSpeedX;
        this.realTimeMoveSpeedY = this.moveSpeedY;

        console.table({
            "x 移动距离": offsetX,
            "x 移动速度": this.moveSpeedX,
            "y 移动距离": offsetY,
            "y 移动速度": this.moveSpeedY
        });

        let beyond = this.checkBound();

        if (Math.abs(this.moveSpeedX) > 0.4 || Math.abs(this.moveSpeedY) > 0.4 || !beyond.allOver) {
            // 速度大于某个值或不全在内部或没完全覆盖执行
            this.isInching = true;
            this.startInchingTimeX = -1;
            this.startInchingTimeY = -1;
            this.lastInchingTime = -1;
            this.beforeBound = null;
            this.expectedMoveX = 0;
            this.expectedMoveY = 0;
            this.isReturnX = false;
            this.isReturnY = false;
            this.outerStartInchingTimeX = 0;
            this.outerStartInchingTimeY = 0;
            window.requestAnimationFrame(this.updateElCoordinateForUp);
        }

        this.removeEvents();
    }

    updateElCoordinateForUp = (timing) => {
        if (this.startInchingTimeX === -1 && this.startInchingTimeY === -1 && this.lastInchingTime === -1) {
            this.lastInchingTime = this.startInchingTimeX = this.startInchingTimeY = timing - this.frame;
        }

        let beyond = this.checkBound();

        if (!this.isInching || (beyond.allOver && (Math.abs(this.realTimeMoveSpeedX) <= 0 && Math.abs(this.realTimeMoveSpeedY) <= 0))) {
            return;
        }
        // console.log(`${beyond.allOver} && (${!this.isInching} || (${Math.abs(this.realTimeMoveSpeedX) < 0} && ${Math.abs(this.realTimeMoveSpeedY) < 0}))`);
        this.startInchingTimeX = this.startInchingTimeY = Math.max(this.startInchingTimeX, this.startInchingTimeY);

        let offsetX, offsetY;
        if (beyond.beyondX === 0) {
            if (!this.beforeBound || this.beforeBound?.beyondX !== 0) {
                // 更新当前速度 x
                this.moveSpeedX = this.realTimeMoveSpeedX;
            }

            this.isReturnX = false;
            let intoRatioX = 1 - this.inchingBezier.solve((timing - this.startInchingTimeX) / 1500);
            intoRatioX = Math.max(0, Math.min(intoRatioX, 1));
            this.realTimeMoveSpeedX = this.moveSpeedX * intoRatioX;
            offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
        } else {
            this.startInchingTimeX += timing - this.lastInchingTime;
            if (!this.beforeBound || this.beforeBound?.beyondX === 0) {
                // 目标速度
                this.moveSpeedX = this.realTimeMoveSpeedX;
                this.expectedMoveX = 0;
                for (let i = this.frame; i < 250; i += this.frame) {
                    let ratio = 1 - this.inchingBezier.solve(i / 250);
                    ratio = Math.max(0, Math.min(ratio, 1));
                    if (Math.abs(this.moveSpeedX * ratio) < Math.abs(this.moveSpeedX * 0.5)) {
                        break;
                    }
                    this.expectedMoveX += this.moveSpeedX * ratio * 1 * this.frame;
                }
                this.moveSpeedX = this.realTimeMoveSpeedX = this.realTimeMoveSpeedX * 0.5;
                this.outerStartInchingTimeX = timing - this.frame;
            }

            let outofRatioX = this.inchingBezier.solve((timing - this.outerStartInchingTimeX) / 150);
            outofRatioX = Math.max(0, Math.min(outofRatioX, 1));
            if (timing - this.outerStartInchingTimeX < 150) {
                this.isReturnX = false;
                offsetX = (this.expectedMoveX * outofRatioX) - beyond.beyondX;
            } else {
                if (!this.isReturnX) {
                    this.isReturnX = true;
                    this.realTimeMoveSpeedX = -this.realTimeMoveSpeedX;
                }
                offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
            }
        }

        if (beyond.beyondY === 0) {
            if (!this.beforeBound || this.beforeBound?.beyondY !== 0) {
                // 更新当前速度 y
                this.moveSpeedY = this.realTimeMoveSpeedY;
            }

            this.isReturnY = false;
            let intoRatioY = 1 - this.inchingBezier.solve((timing - this.startInchingTimeY) / 1500);
            intoRatioY = Math.max(0, Math.min(intoRatioY, 1));
            this.realTimeMoveSpeedY = this.moveSpeedY * intoRatioY;
            offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
        } else {
            this.startInchingTimeY += timing - this.lastInchingTime;
            if (!this.beforeBound || this.beforeBound?.beyondY === 0) {
                // 目标速度
                this.moveSpeedY = this.realTimeMoveSpeedY;
                this.expectedMoveY = 0;
                for (let i = this.frame; i < 250; i += this.frame) {
                    let ratio = 1 - this.inchingBezier.solve(i / 250);
                    ratio = Math.max(0, Math.min(ratio, 1));
                    if (Math.abs(this.moveSpeedY * ratio) < Math.abs(this.moveSpeedY * 0.5)) {
                        break;
                    }
                    this.expectedMoveY += this.moveSpeedY * ratio * 1 * this.frame;
                }
                this.moveSpeedY = this.realTimeMoveSpeedY = this.realTimeMoveSpeedY * 0.5;
                this.outerStartInchingTimeY = timing - this.frame;
            }

            let outofRatioY = this.inchingBezier.solve((timing - this.outerStartInchingTimeY) / 150);
            if (timing - this.outerStartInchingTimeY < 150) {
                this.isReturnY = false;
                offsetY = (this.expectedMoveY * outofRatioY) - beyond.beyondY;
            } else {
                if (!this.isReturnY) {
                    this.isReturnY = true;
                    this.realTimeMoveSpeedY = -this.realTimeMoveSpeedY;
                }
                offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
            }
        }

        // console.log(this.realTimeMoveSpeedX, this.realTimeMoveSpeedY);

        this.targetCoordinate[0] += offsetX;
        this.targetCoordinate[1] += offsetY;


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