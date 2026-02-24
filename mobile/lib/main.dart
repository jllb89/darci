import "package:flutter/material.dart";

void main() {
  runApp(const DarciApp());
}

class DarciApp extends StatelessWidget {
  const DarciApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "DARCI Mobile",
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const Scaffold(
        body: Center(
          child: Text("DARCI Mobile - TODO"),
        ),
      ),
    );
  }
}
