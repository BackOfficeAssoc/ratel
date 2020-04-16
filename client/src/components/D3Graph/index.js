// Copyright 2017-2019 Dgraph Labs, Inc. and Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import * as d3 from "d3";
import { event as currentEvent } from "d3-selection"; // Because https://stackoverflow.com/questions/36887428/d3-event-is-null-in-a-reactjs-d3js-component
import debounce from "lodash.debounce";

import "./D3Graph.scss";

const ARROW_LENGTH = 5;
const ARROW_WIDTH = 2;

const NODE_RADIUS = 9;
const DOUBLE_CLICK_MS = 250;

const fixedPosForce = () => {
    let self = {
        nodes: [],
    };

    const res = function tick(alpha) {
        self.nodes.forEach(n => {
            if (!n._posFixed) {
                return;
            }
            n.x = n._posFixed.x;
            n.y = n._posFixed.y;
        });
    };

    res.initialize = nodes => (self.nodes = nodes);

    res.setNodeCoords = (node, x, y) => {
        node._posFixed = { x, y };
        node.x = x;
        node.y = y;
    };

    return res;
};

export default class D3Graph extends React.Component {
    width = 100;
    height = 100;
    outer = React.createRef();

    devicePixelRatio = window.devicePixelRatio || 1;

    state = {
        transform: d3.zoomTransform({}),
    };

    document = {
        nodes: new Map(),
        edges: new Map(),
    };

    labelEdge = (context, edge) => {
        if (
            (this.document.edges.length > 40 &&
                this.state.transform.k * this.devicePixelRatio < 1.25) ||
            this.document.edges.length > 200
        ) {
            return;
        }

        const { x: x1, y: y1 } = edge.source;
        const { x: x2, y: y2 } = edge.target;
        const dx = x2 - x1,
            dy = y2 - y1;
        if (Math.sqrt(dx * dx + dy * dy) < 2 * NODE_RADIUS + 50) {
            return;
        }

        const cx = 0.5 * (x1 + x2);
        const cy = 0.5 * (y1 + y2);

        context.font = `12px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        const maxWidth = 50,
            bgPadding = 2;
        let { width } = context.measureText(edge.label);
        width = Math.min(width, maxWidth);

        context.globalAlpha = 0.5;
        context.fillStyle = "#fff";

        context.fillRect(
            cx - width / 2 - bgPadding,
            cy - 6,
            width + 2 * bgPadding,
            12,
        );
        context.globalAlpha = 1;

        if (this.props.activeEdge === edge) {
            context.shadowColor = edge.color;
            context.shadowBlur = 3;
        }
        context.fillStyle = edge.color;
        context.fillText(edge.label, cx, cy, maxWidth);

        context.shadowColor = null;
        context.shadowBlur = 0;
    };

    labelNode = (context, node) => {
        if (
            (this.document.nodes.size > 50 &&
                this.state.transform.k * this.devicePixelRatio < 1.2) ||
            this.document.nodes.size > 500
        ) {
            return;
        }

        const fontSize = 14;
        context.font = `${fontSize}px sans-serif`;
        context.textAlign = "center";
        context.fillText(
            node.label,
            node.x,
            node.y + NODE_RADIUS + fontSize - 7,
            60,
        );
    };

    _drawAll = () => {
        const context = this.canvasContext;
        if (!context) {
            return;
        }

        const { highlightPredicate } = this.props;

        context.save();
        const { devicePixelRatio: dpr } = this;
        context.clearRect(0, 0, this.width * dpr, this.height * dpr);

        context.translate(
            this.state.transform.x * dpr,
            this.state.transform.y * dpr,
        );
        context.scale(
            this.state.transform.k * dpr,
            this.state.transform.k * dpr,
        );

        this.document.edges.forEach(edge => {
            context.beginPath();
            context.moveTo(edge.source.x, edge.source.y);
            context.strokeStyle = edge.color;
            context.lineWidth =
                edge.predicate === highlightPredicate ? 1.5 : 0.5;

            if (edge === this.props.activeEdge) {
                context.lineWidth = 2.0;
            }

            context.lineTo(edge.target.x, edge.target.y);

            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const l = Math.sqrt(dx * dx + dy * dy);
            if (l > 2 * NODE_RADIUS + 2 * ARROW_LENGTH) {
                // Edge is long enough to have an arrow.
                const arrowBase = [
                    edge.target.x - ((NODE_RADIUS + ARROW_LENGTH) * dx) / l,
                    edge.target.y - ((NODE_RADIUS + ARROW_LENGTH) * dy) / l,
                ];
                const arrowEnd = [
                    edge.target.x - (NODE_RADIUS * dx) / l,
                    edge.target.y - (NODE_RADIUS * dy) / l,
                ];
                context.moveTo(arrowEnd[0], arrowEnd[1]);
                context.lineTo(
                    arrowBase[0] + (ARROW_WIDTH * dy) / l,
                    arrowBase[1] - (ARROW_WIDTH * dx) / l,
                );

                context.moveTo(arrowEnd[0], arrowEnd[1]);
                context.lineTo(
                    arrowBase[0] - (ARROW_WIDTH * dy) / l,
                    arrowBase[1] + (ARROW_WIDTH * dx) / l,
                );
            }

            context.stroke();

            this.labelEdge(context, edge);
            context.lineWidth = 0.5;
        });

        // Draw the nodes
        this.document.nodes.forEach(d => {
            context.fillStyle = d.color || "#ccc";
            context.strokeStyle = "#c63";

            context.beginPath();
            context.arc(d.x, d.y, NODE_RADIUS, 0, 2 * Math.PI, true);
            context.fill();
            context.stroke();

            if (d === this.props.activeNode) {
                context.lineWidth = 1.5;
                context.beginPath();
                context.arc(d.x, d.y, NODE_RADIUS, 0, 2 * Math.PI, true);
                context.stroke();
                context.lineWidth = 0.5;
            }

            this.labelNode(context, d);
        });

        context.restore();
    };

    drawGraph = debounce(this._drawAll, 5, { leading: true, trailing: true });

    createForces = () => {
        this.d3simulation
            .alphaTarget(0.05)
            .alphaMin(0.05005)
            .alphaDecay(0.02)
            .velocityDecay(0.09)
            .force(
                "link",
                d3
                    .forceLink()
                    .distance(60)
                    .strength(0.05)
                    .id(d => d.id),
            )
            .force("charge", d3.forceManyBody().strength(-10))
            .force("fixedPosForce", fixedPosForce());

        this.fixedPosForce = this.d3simulation.force("fixedPosForce");
        this.edgesForce = this.d3simulation.force("link");
    };

    componentDidMount() {
        this.d3simulation = d3.forceSimulation().on("tick", this.drawGraph);
        this.createForces();

        this.graphCanvas = d3
            .select(this.outer.current)
            .append("canvas")
            .attr("width", this.width)
            .attr("height", this.height)
            .node();

        this.zoomBehavior = d3
            .zoom()
            .scaleExtent([
                (1 / 4) * this.devicePixelRatio,
                4 * this.devicePixelRatio,
            ])
            .on("zoom", this.onZoom);

        d3.select(this.graphCanvas)
            .on("click", this.onClick)
            .on("dblclick", this.onDoubleClick)
            .on("mousemove", this.onMouseMove)
            .call(
                d3
                    .drag()
                    .subject(this.dragsubject)
                    .on("start", this.dragstarted)
                    .on("drag", this.dragged),
            )
            .call(this.zoomBehavior);

        this.onResize();
        this.updateDocument(this.props.nodes, this.props.edges);

        this.resizeObserver = window.setInterval(this.onResize, 1000);
    }

    componentWillUnmount() {
        clearInterval(this.resizeObserver);
    }

    getD3EventCoords = event => {
        // TODO: event object probably already has inverted coords,
        // so this whole method is redundant.
        return this.state.transform.invert([event.x, event.y]);
    };

    findNodeAtPos = (x, y) => {
        let minNode = undefined;
        let minD = 1e10;
        this.document.nodes.forEach(n => {
            const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
            if (d < minD) {
                minNode = n;
                minD = d;
            }
        });

        if (minD > NODE_RADIUS * NODE_RADIUS) {
            return undefined;
        }
        return minNode;
    };

    findEdgeAtPos = (x, y) => {
        let minEdge = undefined;
        let minD = 1e10;
        this.document.edges.forEach(edge => {
            const cx = (edge.source.x + edge.target.x) / 2;
            const cy = (edge.source.y + edge.target.y) / 2;
            const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
            if (d < minD) {
                minEdge = edge;
                minD = d;
            }
        });

        if (minD > 10 * 10) {
            return undefined;
        }
        return minEdge;
    };

    onMouseMove = () => {
        const { offsetX: x, offsetY: y } = currentEvent;
        const pt = this.getD3EventCoords({ x, y });

        const node = this.findNodeAtPos(...pt);
        this.props.onNodeHovered(node);

        if (!node) {
            this.props.onEdgeHovered(this.findEdgeAtPos(...pt));
        }
    };

    onClick = () => {
        const { offsetX: x, offsetY: y } = currentEvent;
        const pt = this.getD3EventCoords({ x, y });

        const node = this.findNodeAtPos(...pt);
        if (node) {
            currentEvent.stopImmediatePropagation();
            return this.props.onNodeSelected(node);
        } else {
            const edge = this.findEdgeAtPos(...pt);
            if (edge) {
                currentEvent.stopImmediatePropagation();
                return this.props.onEdgeSelected(edge);
            }
        }
    };

    onDoubleClick = () => {
        const { offsetX: x, offsetY: y } = currentEvent;
        const pt = this.getD3EventCoords({ x, y });

        const node = this.findNodeAtPos(...pt);
        if (node) {
            currentEvent.stopImmediatePropagation();
            return this.props.onNodeDoubleClicked(node);
        }
    };

    dragsubject = () => {
        const { offsetX: x, offsetY: y } = currentEvent.sourceEvent;
        const pt = this.getD3EventCoords({ x, y });

        const node = this.findNodeAtPos(...pt);
        this.props.onNodeSelected(node);

        return node;
    };

    dragstarted = () => {
        if (!currentEvent.active) {
            setTimeout(
                () => this.d3simulation.alpha(0.5).restart(),
                DOUBLE_CLICK_MS,
            );
        }
    };

    dragged = () => {
        const { offsetX: x, offsetY: y } = currentEvent.sourceEvent;
        const pt = this.getD3EventCoords({ x, y });

        this.fixedPosForce.setNodeCoords(currentEvent.subject, ...pt);
        this.drawGraph();

        this.d3simulation.alpha(Math.max(0.12, this.d3simulation.alpha()));
    };

    _updateZoom = transform => {
        if (this.state.transform.toString() !== transform.toString()) {
            this.setState({ transform });
        }
    };
    updateZoom = debounce(this._updateZoom, 2, {
        leading: true,
        trailing: true,
    });

    onZoom = () => this.updateZoom(currentEvent.transform);

    onResize = () => {
        let resized = false;
        if (this.outer.current) {
            const el = this.outer.current;

            resized |= this.width !== el.offsetWidth;
            resized |= this.height !== el.offsetHeight;

            this.width = el.offsetWidth;
            this.height = el.offsetHeight;
        }

        if (!resized) {
            return;
        }

        this.zoomBehavior.scaleTo(d3.select(this.graphCanvas), 1);
        this.zoomBehavior.translateTo(d3.select(this.graphCanvas), 0, 0);

        const { width, height } = this;
        this.d3simulation
            .force("x", d3.forceX(0).strength((0.01 * height) / width))
            .force("y", d3.forceY(0).strength((0.01 * width) / height));

        d3.select(this.graphCanvas)
            .attr("width", this.width * this.devicePixelRatio)
            .attr("height", this.height * this.devicePixelRatio);

        this.canvasContext = this.graphCanvas.getContext("2d");

        this._drawAll();
    };

    updateDocument = (nodes, edges) => {
        if (!this.d3simulation || !nodes || !edges) {
            return;
        }

        const newNodesReceived =
            this.document.nodesLength !== nodes.size ||
            this.document.edgesLength !== edges.size;

        if (newNodesReceived) {
            this.d3simulation.alpha(1).restart();
        }

        this.document = {
            edges,
            edgesLength: edges.size,
            nodes,
            nodesLength: nodes.size,
        };
        this.d3simulation.nodes(Array.from(nodes.values()));
        this.edgesForce.links(Array.from(edges.values()));
    };

    render() {
        this.updateDocument(this.props.nodes, this.props.edges);
        this.onResize();
        this.drawGraph();

        return <div ref={this.outer} className="graph-outer" />;
    }
}
