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
    startInchingTime = 0;
    lastInchingTime = 0;
    frame = 11.11;
    beforeBound = null;
    expectedMoveX = 0;
    expectedMoveY = 0;
    isReturnX = false;
    isReturnY = false;

    // 补偿值，高刷屏执行频率会变高导致动画距离变长（补偿基数定为 100）
    compensate = 1;

    targetCoordinate = [0, 0];
    beforeCoordinate = [0, 0];
    currentCoordinate = [0, 0];
    trackPoints = [];

    dragX = true;
    dragY = true;

    boundX = null;
    boundY = null;

    bezier = null;
    returnBezier = null;
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

        this.returnBezier = new CubicBezier([
            [0, 0],
            [.28, .59,],
            [.47, .76],
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
            this.compensate = 100 / (1000 / this.frame);
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

        if (Math.abs(this.moveSpeedX) > 0.1 || Math.abs(this.moveSpeedY) > 0.1 || !beyond.allOver) {
            // 速度大于某个值或不全在内部或没完全覆盖执行
            this.isInching = true;
            this.startInchingTime = -1;
            this.lastInchingTime = -1;
            this.beforeBound = null;
            this.expectedMoveX = 0;
            this.expectedMoveY = 0;
            this.isReturnX = false;
            this.isReturnY = false;
            window.requestAnimationFrame(this.updateElCoordinateForUp);
        }

        this.removeEvents();
    }

    updateElCoordinateForUp = (timing) => {
        if (this.startInchingTime === -1 && this.lastInchingTime === -1) {
            this.startInchingTime = timing - this.frame;
            this.lastInchingTime = this.startInchingTime;
        }

        let beyond = this.checkBound();

        if (!this.isInching || (beyond.allOver && (Math.abs(this.realTimeMoveSpeedX) <= 0 && Math.abs(this.realTimeMoveSpeedY) <= 0))) {
            return;
        }
        // console.log(`${beyond.allOver} && (${!this.isInching} || (${Math.abs(this.realTimeMoveSpeedX) < 0} && ${Math.abs(this.realTimeMoveSpeedY) < 0}))`);

        if (!this.beforeBound || (this.beforeBound?.beyondX === 0 && beyond.beyondX !== 0) || (this.beforeBound?.beyondX !== 0 && beyond.beyondX === 0)) {
            // 更新当前速度 x
            this.moveSpeedX = this.realTimeMoveSpeedX;
            // 约定 0.005 速度制动 1 像素
            this.expectedMoveX = Math.abs(this.moveSpeedX / 0.005 * 1);
        }
        if (!this.beforeBound || (this.beforeBound?.beyondY === 0 && beyond.beyondY !== 0) || (this.beforeBound?.beyondY !== 0 && beyond.beyondY === 0)) {
            // 更新当前速度 y
            this.moveSpeedY = this.realTimeMoveSpeedY;
            // 约定 0.005 速度制动 1 像素
            this.expectedMoveY = Math.abs(this.moveSpeedY / 0.005 * 1);
        }

        let intoRatio = 1 - this.inchingBezier.solve((timing - this.startInchingTime) / 1500);
        intoRatio = Math.max(0, Math.min(intoRatio, 1));
        let offsetX, offsetY;
        if (beyond.beyondX === 0) {
            this.isReturnX = false;
            // 带上补偿
            this.realTimeMoveSpeedX = this.moveSpeedX * intoRatio;
            offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
            // offsetX = this.realTimeMoveSpeedX * 15 * this.compensate;
        } else {
            // todo 不应当使用 beyondX 或 beyondY 距离，应从开始制动时就应当统计元素移动距离，用这个距离比上 distance 用作减速 outofRatio ->（getBoundingClientRect）
            if (Math.abs(this.realTimeMoveSpeedX) > Math.abs(this.moveSpeedX * 0.5) && beyond.beyondX !== 0) {
                this.isReturnX = false;
                let outofRatioX = Math.min(Math.abs(beyond.beyondX), this.expectedMoveX);
                outofRatioX = 1 - this.inchingBezier.solve(outofRatioX / this.expectedMoveX);
                outofRatioX = Math.max(0.01, Math.min(outofRatioX, 0.99));

                this.realTimeMoveSpeedX = this.moveSpeedX * outofRatioX;
                offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
                // offsetX = this.realTimeMoveSpeedX * 15 * this.compensate;
            } else {
                if (!this.isReturnX) {
                    this.isReturnX = true;
                    this.realTimeMoveSpeedX = -this.realTimeMoveSpeedX;
                }
                offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
            }
        }

        if (beyond.beyondY === 0) {
            this.isReturnY = false;
            // 带上补偿
            this.realTimeMoveSpeedY = this.moveSpeedY * intoRatio;
            offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
            // offsetX = this.realTimeMoveSpeedY * 15 * this.compensate;
        } else {
            // todo 不应当使用 beyondX 或 beyondY 距离，应从开始制动时就应当统计元素移动距离，用这个距离比上 distance 用作减速 outofRatio ->（getBoundingClientRect）
            if (Math.abs(this.realTimeMoveSpeedY) > Math.abs(this.moveSpeedY * 0.5) && beyond.beyondY !== 0) {
                this.isReturnY = false;
                let outofRatioY = Math.min(Math.abs(beyond.beyondY), this.expectedMoveY);
                outofRatioY = 1 - this.inchingBezier.solve(outofRatioY / this.expectedMoveY);
                outofRatioY = Math.max(0.01, Math.min(outofRatioY, 0.99));

                this.realTimeMoveSpeedY = this.moveSpeedY * outofRatioY;
                offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
                // offsetX = this.realTimeMoveSpeedY * 15 * this.compensate;
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

    returnDragBezier = (beyond) => {
        let ratio = Math.min(Math.abs(beyond), this.sss) / this.sss;
        ratio = this.returnBezier.solve(ratio);
        return 1 - Math.max(0.01, Math.min(ratio, 0.99));
    }

    homingBezier = (ratio) => {
        // console.log(ratio);
        ratio = this.returnBezier.solve(ratio);
        return Math.max(0.01, Math.min(ratio, 0.99));
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