from PIL import Image, ImageDraw

SCALE = 4
SIZE = 512
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)


def polygon(points, fill, outline=None, width=1):
    points = [(x * SCALE, y * SCALE) for x, y in points]
    draw.polygon(points, fill=fill)
    if outline:
        draw.line(points + [points[0]], fill=outline, width=width * SCALE, joint="curve")


def ellipse(box, fill, outline=None, width=1):
    box = tuple(value * SCALE for value in box)
    draw.ellipse(box, fill=fill, outline=outline, width=width * SCALE)


def line(points, fill, width=1):
    draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=fill, width=width * SCALE, joint="curve")


ink = "#213442"
fur = "#8f9b9a"
fur_light = "#d8ddd3"
fur_dark = "#536161"
mask = "#485858"
cloak = "#245e4e"
cloak_light = "#3e8c72"
wind = "#7ef0bb"
gold = "#f4cb78"

# Ringed tail behind the character.
line([(334, 347), (402, 369), (427, 337), (410, 307), (382, 312)], fur_dark, 52)
line([(334, 347), (402, 369), (427, 337), (410, 307), (382, 312)], fur, 36)
for x, y in [(372, 359), (397, 361), (414, 342)]:
    line([(x - 4, y - 15), (x + 5, y + 15)], fur_dark, 9)

# Cloak silhouette and warm lining.
polygon([(156, 275), (119, 390), (174, 430), (256, 447), (334, 422), (366, 389), (344, 280), (288, 256), (210, 256)], cloak, ink, 5)
polygon([(192, 286), (164, 390), (256, 427), (337, 390), (318, 289), (258, 314)], cloak_light, None)
polygon([(232, 301), (256, 427), (280, 301), (256, 325)], "#f0dcaf", ink, 3)

# Boots and little paws.
ellipse((180, 412, 244, 457), fur_dark, ink, 4)
ellipse((268, 412, 332, 457), fur_dark, ink, 4)
ellipse((191, 420, 235, 445), fur_light)
ellipse((277, 420, 321, 445), fur_light)

# Ears behind the head.
polygon([(150, 173), (151, 93), (219, 150)], fur_dark, ink, 6)
polygon([(293, 150), (362, 93), (361, 177)], fur_dark, ink, 6)
polygon([(166, 144), (166, 119), (192, 148)], "#d89391")
polygon([(319, 148), (346, 119), (346, 145)], "#d89391")

# Chibi head and facial mask.
ellipse((137, 125, 375, 329), fur, ink, 7)
ellipse((162, 186, 350, 287), mask, None)
ellipse((161, 170, 254, 267), fur_light, None)
ellipse((257, 170, 351, 267), fur_light, None)

# Eyes, nose, muzzle, expression.
ellipse((196, 202, 224, 235), "#1c2b38")
ellipse((288, 202, 316, 235), "#1c2b38")
ellipse((204, 208, 212, 216), "#ffffff")
ellipse((296, 208, 304, 216), "#ffffff")
ellipse((242, 242, 270, 262), "#293640", ink, 2)
ellipse((218, 260, 294, 302), fur_light, None)
line([(256, 263), (256, 277), (242, 280)], ink, 3)
line([(256, 277), (270, 280)], ink, 3)
line([(211, 269), (184, 264)], ink, 2)
line([(211, 277), (183, 281)], ink, 2)
line([(301, 269), (329, 264)], ink, 2)
line([(301, 277), (329, 281)], ink, 2)

# Hood lip framing the face.
line([(158, 190), (163, 154), (206, 133)], gold, 8)
line([(306, 133), (350, 154), (354, 190)], gold, 8)

# Bow and wind energy held across the body.
line([(105, 308), (112, 385)], gold, 8)
line([(105, 308), (72, 280), (62, 329), (106, 351)], wind, 5)
line([(112, 385), (151, 406), (160, 365), (112, 342)], wind, 5)
line([(82, 330), (345, 292)], "#d9fff0", 3)
polygon([(348, 292), (330, 282), (334, 302)], wind, ink, 2)
ellipse((244, 326, 278, 362), fur_light, ink, 3)
ellipse((253, 334, 269, 351), wind)

# Sparkling wind accents, kept away from the silhouette edge.
for x, y in [(368, 231), (399, 258), (387, 289), (130, 239)]:
    line([(x - 8, y), (x + 8, y)], wind, 3)
    line([(x, y - 8), (x, y + 8)], wind, 3)

canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(
    "public/images/autochess/portraits/raccoon-archer.png", "PNG", optimize=True
)
