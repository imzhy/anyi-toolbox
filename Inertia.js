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
    inchingStatus = 0;

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
    isReturn = false;

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
        console.log(beyond);

        if (Math.abs(this.moveSpeedX) > 0.1 || Math.abs(this.moveSpeedY) > 0.1 || !beyond.allOver) {
            // 速度大于某个值或不全在内部或没完全覆盖执行
            this.isInching = true;
            this.startInchingTime = -1;
            this.lastInchingTime = -1;
            this.inchingStatus = 0;
            this.isReturn = false;
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

        if (this.inchingStatus !== -1 && beyond.allOver && (!this.isInching || (Math.abs(this.realTimeMoveSpeedX) <= 0 && Math.abs(this.realTimeMoveSpeedY) <= 0))) {
            return;
        }
        // console.log(`${this.inchingStatus !== -1} && ${beyond.allOver} && (${!this.isInching} || (${Math.abs(this.realTimeMoveSpeedX) < 0} && ${Math.abs(this.realTimeMoveSpeedY) < 0}))`);

        let intoRatio = 1 - this.inchingBezier.solve((timing - this.startInchingTime) / 1500);
        intoRatio = Math.max(0, Math.min(intoRatio, 1));

        let offsetX, offsetY;
        if (beyond.allOver) {
            if (this.inchingStatus !== 1) {
                this.inchingStatus = 1;
            }
            // 带上补偿
            this.realTimeMoveSpeedX = this.moveSpeedX * intoRatio;
            this.realTimeMoveSpeedY = this.moveSpeedY * intoRatio;
            offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
            // offsetX = this.realTimeMoveSpeedX * 15 * this.compensate;
            offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
            // offsetX = this.realTimeMoveSpeedY * 15 * this.compensate;
            console.log(this.realTimeMoveSpeedX, this.realTimeMoveSpeedY, intoRatio);
        } else {
            if (true) {
                if (this.inchingStatus !== -1) {
                    this.inchingStatus = -1;
                    // 更新当前速度
                    this.moveSpeedX = this.realTimeMoveSpeedX;
                    this.moveSpeedY = this.realTimeMoveSpeedY;
                    this.startInchingTime = timing - this.frame;
                }

                let longestBeyond = Math.abs(beyond.beyondX) > Math.abs(beyond.beyondY) ? beyond.beyondX : beyond.beyondY;
                let outofRatio = Math.min(Math.abs(longestBeyond + 1), 200);
                outofRatio = 1 - this.inchingBezier.solve(outofRatio / 200);
                outofRatio = Math.max(0.01, Math.min(outofRatio, 0.99));
                console.log(outofRatio);


                this.realTimeMoveSpeedX = this.moveSpeedX * outofRatio;
                this.realTimeMoveSpeedY = this.moveSpeedY * outofRatio;
                offsetX = this.realTimeMoveSpeedX * 1 * (timing - this.lastInchingTime);
                // offsetX = this.realTimeMoveSpeedX * 15 * this.compensate;
                offsetY = this.realTimeMoveSpeedY * 1 * (timing - this.lastInchingTime);
                // offsetX = this.realTimeMoveSpeedY * 15 * this.compensate;
                if (outofRatio <= 0.05) {
                    return;
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

        }

        // console.log(this.realTimeMoveSpeedX, this.realTimeMoveSpeedY);

        this.targetCoordinate[0] += offsetX;
        this.targetCoordinate[1] += offsetY;


        if (!beyond.allOver && (Math.abs(offsetX) < 4 || Math.abs(offsetY) < 4)) {
            // if (!this.isReturn) {
            //     this.startInchingTime = timing;
            //     this.isReturn = true;
            // }
            // if (Math.abs(offsetX) < 1) {
            //     this.targetCoordinate[0] -= beyond.beyondX * this.homingBezier((timing - this.startInchingTime) / 2500 * beyond.beyondX);
            //     // console.log("x 开始返回", offsetX, beyond);
            // }

            // if (Math.abs(offsetY) < 1) {
            //     this.targetCoordinate[1] -= beyond.beyondY * this.homingBezier((timing - this.startInchingTime) / 2500 * beyond.beyondY);
            //     // console.log("y 开始返回", offsetY, beyond);
            // }
        } else {
            if (true) {
                // if (beyond.beyondX !== 0) {
                //     this.targetCoordinate[0] += offsetX * this.dragBezier(beyond.beyondX);
                // } else {
                //     this.targetCoordinate[0] += offsetX;
                // }

                // if (beyond.beyondY !== 0) {
                //     this.targetCoordinate[1] += offsetY * this.dragBezier(beyond.beyondY);
                // } else {
                //     this.targetCoordinate[1] += offsetY;
                // }
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
        }


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
                if ((beyond.beyondX > 0 && offsetX > 0) || (beyond.beyondX < 0 && offsetX < 0)) {
                    this.targetCoordinate[0] += offsetX * this.dragBezier(beyond.beyondX);
                } else {
                    this.targetCoordinate[0] += offsetX * this.returnDragBezier(beyond.beyondX);
                }
            } else {
                this.targetCoordinate[0] += offsetX;
            }

            if (beyond.beyondY !== 0) {
                if ((beyond.beyondY > 0 && offsetY > 0) || (beyond.beyondY < 0 && offsetY < 0)) {
                    this.targetCoordinate[1] += offsetY * this.dragBezier(beyond.beyondY);
                } else {
                    this.targetCoordinate[1] += offsetY * this.returnDragBezier(beyond.beyondY);
                }

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