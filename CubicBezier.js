export class CubicBezier {
    x = null;
    y = null;

    point = [];
    ax = null;
    bx = null;
    cx = null;
    ay = null;
    by = null;
    cy = null;

    constructor(point) {
        this.point = point;
        this.cx = 3.0 * (this.point[1][0] - this.point[0][0]);
        this.bx = 3.0 * (this.point[2][0] - this.point[1][0]) - this.cx;
        this.ax = this.point[3][0] - this.point[0][0] - this.cx - this.bx;

        this.cy = 3.0 * (this.point[1][1] - this.point[0][1]);
        this.by = 3.0 * (this.point[2][1] - this.point[1][1]) - this.cy;
        this.ay = this.point[3][1] - this.point[0][1] - this.cy - this.by;
    }

    curveX = (t) => {
        let tSqu = t * t;
        let tCub = tSqu * t;
        return (this.ax * tCub) + (this.bx * tSqu) + (this.cx * t) + this.point[0][0];
    }

    curveY = (t) => {
        let tSqu = t * t;
        let tCub = tSqu * t;
        return (this.ay * tCub) + (this.by * tSqu) + (this.cy * t) + this.point[0][1];
    }

    solve = (t) => {
        return this.curveY(this.curveX(t));
    }
}